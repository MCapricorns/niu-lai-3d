import globals from "globals";

const correctnessRules = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-class-assign": "error",
  "no-compare-neg-zero": "error",
  "no-const-assign": "error",
  "no-constant-binary-expression": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-new-native-nonconstructor": "error",
  "no-obj-calls": "error",
  "no-promise-executor-return": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-sparse-arrays": "error",
  "no-this-before-super": "error",
  "no-undef": "error",
  "no-unexpected-multiline": "error",
  "no-unreachable": "error",
  "no-unreachable-loop": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-unused-private-class-members": "error",
  "no-useless-assignment": "error",
  "no-useless-backreference": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
};

const sharedOptions = {
  reportUnusedDisableDirectives: "error",
};

export default [
  {
    ignores: ["three.min.js"],
  },
  {
    files: ["game.js", "levels.js", "mapengine.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        THREE: "readonly",
        ME: "readonly",
      },
    },
    linterOptions: sharedOptions,
    rules: correctnessRules,
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        fetch: "readonly",
        WebSocket: "readonly",
      },
    },
    linterOptions: sharedOptions,
    rules: correctnessRules,
  },
];
