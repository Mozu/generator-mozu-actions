// ESLint flat config for the Arc.js actions in assets/src (CommonJS, bundled by browserify).
// Bug-finding rules only: undefined and unused variables, unreachable code, duplicate keys and the like.
// Add your own style rules if you want them.
module.exports = [
  {
    files: ["assets/src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs", // defines require, module and exports
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        // defined by the Arc.js sandbox
        atob: "readonly",
        btoa: "readonly",
        performance: "readonly",
        queueMicrotask: "readonly",
        _: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none" }],
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-redeclare": "error",
      "no-const-assign": "error",
      "no-func-assign": "error",
      "no-self-assign": "error",
      "no-unsafe-negation": "error",
      "no-sparse-arrays": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-shadow-restricted-names": "error",
    },
  },
];
