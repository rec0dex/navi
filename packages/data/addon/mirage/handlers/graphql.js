/**
 * Copyright 2020, Yahoo Holdings Inc.
 * Licensed under the terms of the MIT license. See accompanying LICENSE.md file for terms.
 */
import createGraphQLHandler from 'ember-cli-mirage-graphql/handler';
import schema from 'navi-data/gql/schema';
import gql from 'graphql-tag';
import faker from 'faker';
import Moment from 'moment';

const API_DATE_FORMAT = 'YYYY-MM-DD';

/**
 * @param {Number} n
 * @returns n number of sequential days in format YYYY-MM-DD
 */
function _dateSequence(n) {
  let day = Moment();
  let days = [];
  for (let i = 0; i < n; i++) {
    days.push(Moment(day).format(API_DATE_FORMAT));
    day = Moment(day).subtract(1, 'days');
  }

  return days;
}

function _dimensionValues(n) {
  const vals = [];
  for (let i = 0; i < n; i++) {
    vals.push(faker.commerce.productName());
  }

  return vals;
}

const OPTIONS = {
  fieldsMap: {
    AsyncQueryResult: {
      responseBody(_, db, parent) {
        const { createdOn, query } = parent;

        // Only respond if query was created over 10 seconds ago
        if (Date.now() - createdOn >= 10000) {
          parent.status = 'COMPLETE';
          const queryAST = gql`
            ${query}
          `;

          // Parse requested table, columns, and filters from graphql query
          const selection = queryAST.definitions[0]?.selectionSet.selections[0];
          const table = selection?.name.value;
          // const args = selection?.arguments.map(arg => ({
          //   name: arg.name.value,
          //   value: arg.value.value
          // }));
          const fields = selection?.selectionSet.selections[0].selectionSet.selections[0].selectionSet.selections.map(
            field => field.name.value
          );

          if (table) {
            const dbTable = db.tables.find(table);
            const columns = fields.reduce(
              (groups, column) => {
                const type = ['metric', 'dimension', 'timeDimension'].find(t => dbTable[`${t}Ids`].includes(column));

                if (type) {
                  groups[type].push(column);
                }
                return groups;
              },
              { metric: [], dimension: [], timeDimension: [] }
            );
            let dates = [];
            const dimValues = {};

            if (columns.timeDimension.length > 0) {
              dates = _dateSequence(3);
            }

            if (columns.dimension.length > 0) {
              columns.dimension.forEach(d => {
                // generate between 1 and 3 random dim values for each dimension
                dimValues[d] = _dimensionValues(Math.ceiling(Math.random() * 3));
              });
            }

            // Convert each date into a row of data
            let rows = dates.map(date => {
              return {
                dateTime: date.format()
              };
            });

            // Add id and desc for each dimension
            columns.dimension.forEach(dimension => {
              rows = rows.reduce((newRows, currentRow) => {
                let dimensionValues = _dimensionValues(faker.random.number({ min: 3, max: 5 }));

                return newRows.concat(
                  dimensionValues.map(value => {
                    let newRow = Object.assign({}, currentRow);
                    Object.keys(value).forEach(key => {
                      if (key === 'description') {
                        newRow[`${dimension}|desc`] = value[key];
                      } else {
                        newRow[`${dimension}|${key}`] = value[key];
                      }
                    });
                    return newRow;
                  })
                );
              }, []);
            });

            // Add each metric
            rows = rows.map(row => {
              const metrics = columns.metric.reduce((metricsObj, metric) => {
                metricsObj[metric] = faker.finance.amount();
                return metricsObj;
              }, {});

              Object.keys(metrics).forEach(metric => (row[metric] = metrics[metric]));
              return row;
            });

            return JSON.stringify({
              data: {
                [table]: {
                  edges: rows.map(row => {
                    return {
                      node: row
                    };
                  })
                }
              }
            });
          }
        }
        return null;
      }
    }
  },
  argsMap: {
    // We have to use undefined as the type key because ember-cli-mirage-graphql does not define the type property for edges and connections
    undefined: {
      ids(records, _, ids) {
        return Array.isArray(ids) ? records.filter(record => ids.includes(record.id)) : records;
      }
    }
  },
  mutations: {
    asyncQuery(asyncQueries, { op, data }) {
      const queryIds = data.id ? [data.id] : [];
      const existingQueries = asyncQueries.find(queryIds) || [];
      if (op === 'UPSERT' && existingQueries.length < 1) {
        asyncQueries.add({
          id: data.id,
          asyncAfterSeconds: 10,
          requestId: data.id,
          query: data.query,
          queryType: data.queryType,
          status: data.status,
          createdOn: Date.now()
        });
      } else if (op === 'UPDATE' && existingQueries.length > 0) {
        existingQueries.forEach(query => {
          query.status = data.status;
        });
      } else {
        throw new Error(`Unable to ${op} when ${existingQueries.length} queries exist with id `);
      }
    }
  }
};

export default createGraphQLHandler(schema, OPTIONS);
