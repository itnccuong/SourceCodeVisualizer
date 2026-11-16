import {keep, config, Cache, build} from './modern.js';
import {double} from './helpers.mjs';
import legacy from './legacy.cjs';

export const kept = keep({port: 8080});
export const port = config.port;
export const doubled = double(2);
export const legacyResult = legacy.run(3);
export const cache = new Cache();
export const pending = build();
