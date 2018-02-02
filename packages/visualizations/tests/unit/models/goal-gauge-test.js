import { moduleForModel, test } from 'ember-qunit';
import Ember from 'ember';
import { buildTestRequest } from '../../helpers/request';

const { run, set } = Ember;

moduleForModel('all-the-fragments', 'Unit | Model | Gauge Visualization Fragment', {
  needs: [
    'model:goal-gauge',
    'validator:request-metric-exist',
    'validator:number',
  ]
});

test('isValidForRequest', function(assert) {
  assert.expect(6);

  let request = buildTestRequest(['rupees'], []),
      goalGauge = run(() => this.subject().get('goalGauge'));

  run(() => set(goalGauge, 'metadata', { metric: 'rupees'}));
  assert.notOk(goalGauge.isValidForRequest(request),
    'config for goal gauge is invalid when metric in config but baseline and goal do not exists config');

  run(() => set(goalGauge, 'metadata', { metric: 'rupees', baselineValue: 34, goalValue: 50 }));
  assert.ok(goalGauge.isValidForRequest(request),
    'config for goal gauge is valid when baseline and goal exist in the config and the metric exists in the request');

  run(() => set(goalGauge, 'metadata', { metric: 'rupees', baselineValue: '34', goalValue: '50' }));
  assert.ok(goalGauge.isValidForRequest(request),
    'in order to support web service response, config values can contain string representations of numbers');

  run(() => set(goalGauge, 'metadata', { metric: 'rupees', baselineValue: 'e', goalValue: 50 }));
  assert.notOk(goalGauge.isValidForRequest(request),
    'config for goal gauge is invalid when baseline is not a number');

  run(() => set(goalGauge, 'metadata', { metric: 'rupees', baselineValue: 34, goalValue: 'abc' }));
  assert.notOk(goalGauge.isValidForRequest(request),
    'config for goal gauge is invalid when goal is not a number');

  request = buildTestRequest(['swords', 'hp'], []);
  assert.notOk(goalGauge.isValidForRequest(request),
    'config for goal gauge is invalid when metric in config does not exist in request');
});

test('rebuildConfig', function(assert) {
  assert.expect(5);

  let request = buildTestRequest(['rupees'], []),
      response = { rows: [ { rupees: 10 } ] },
      gauge = run(() => this.subject().get('goalGauge')),
      orginalConfig = gauge.toJSON(),
      blankConfig = run(() => gauge.rebuildConfig().toJSON()),
      newConfig = run(() => gauge.rebuildConfig(request, response).toJSON()),
      expectedConfig = {
        metadata: {
          baselineValue: 9,
          goalValue: 11,
          metric: 'rupees'
        },
        type: 'goal-gauge',
        version: 1
      },
      expectedFloatConfig = {
        metadata: {
          baselineValue: 0.9,
          goalValue: 1.1,
          metric: 'rupees'
        },
        type: 'goal-gauge',
        version: 1
      },
      expectedNegativeConfig = {
        metadata: {
          baselineValue: -11,
          goalValue: -9,
          metric: 'rupees'
        },
        type: 'goal-gauge',
        version: 1
      },
      expectedZeroConfig = {
        metadata: {
          baselineValue: 0,
          goalValue: 1,
          metric: 'rupees'
        },
        type: 'goal-gauge',
        version: 1
      };

  // positive integer
  assert.deepEqual(blankConfig,
    orginalConfig,
    'returns original config if no request or response is sent to rebuildConfig');
  assert.deepEqual(newConfig,
    expectedConfig,
    'rebuilds config based on request');

  // decimal
  response = { rows: [ { rupees: 1 } ] };
  newConfig = run(() => gauge.rebuildConfig(request, response).toJSON());
  assert.deepEqual(newConfig,
    expectedFloatConfig,
    'rebuilds config based on request with decimal metric');

  // negative integer
  response = { rows: [ { rupees: -10 } ] };
  newConfig = run(() => gauge.rebuildConfig(request, response).toJSON());
  assert.deepEqual(newConfig,
    expectedNegativeConfig,
    'rebuilds config based on request with negative metric');

  // zero
  response = { rows: [ { rupees: 0 } ] };
  newConfig = run(() => gauge.rebuildConfig(request, response).toJSON());
  assert.deepEqual(newConfig,
    expectedZeroConfig,
    'rebuilds config based on request with zero metric');
});