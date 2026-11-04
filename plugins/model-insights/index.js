import { Plugin } from '@opencode/plugin';
import { setup } from './src/setup.js';

export default Plugin.define({
  id: 'model-insights',
  setup: (ctx) => setup(ctx),
});
