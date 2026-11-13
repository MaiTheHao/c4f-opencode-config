import { Plugin } from '@opencode/plugin';
import { setup } from './src/setup.js';

export default Plugin.define({
  id: 'c4f-status',
  setup: (ctx) => setup(ctx),
});
