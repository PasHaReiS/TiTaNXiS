import reactHooks from "eslint-plugin-react-hooks";
export default [{
  files: ["**/*.js","**/*.jsx"],
  plugins: { "react-hooks": reactHooks },
  rules: { "react-hooks/exhaustive-deps": "warn", "react-hooks/rules-of-hooks": "error" },
  languageOptions: { parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } } }
}];
