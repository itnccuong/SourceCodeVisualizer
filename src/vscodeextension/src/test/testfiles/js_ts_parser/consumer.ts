import {double} from './helpers.mjs';
import legacy from './legacy.cjs';
import {lookup} from './api';
import {esmLookup} from './esm-api.mjs';
import cjsApi = require('./cjs-api.cjs');

export const doubled = double(4);
export const legacyResult = legacy.run(5);
export const text = lookup('value');
export const numeric = lookup(42);
export const esmResult = esmLookup('esm');
export const cjsResult = cjsApi.lookup('cjs');
