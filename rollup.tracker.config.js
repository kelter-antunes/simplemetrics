import buble from '@rollup/plugin-buble';

export default {
  input: 'tracker/index.js',
  output: {
    file: 'public/simplemetrics.js',
    format: 'iife',
  },
  plugins: [
    buble({ objectAssign: true }),
  ],
};