# farazhussain / docusign-handbook-widget

A DocuSign-branded e-signature widget for acknowledging receipt of the Employee Handbook. The handbook itself is read via a separate link; this widget covers the tag-to-sign → adopt signature → finish workflow, mirroring DocuSign's own UI. The signer's name/initials are pulled from the real Staffbase user profile via `widgetApi.getUserInformation()` — no typed name field.

## Installation

```bash
$ npm install
```

## Running the app

| Command | Description |
|---|---|
| `npm start` | Starts the development server |
| `npm run build` | Creates the production build |
| `npm run build:watch` | Creates the production build and watch for changes |
| `npm run test` | Runs the unit tests |
| `npm run test:watch` | Runs the unit tests and watches for changes |
| `npm run type-check` | Checks the codebase on type errors |
| `npm run type-check:watch` | Checks the codebase on type errors and watches for changes |
| `npm run lint` | Checks the codebase on style issues |
| `npm run lint:fix` | Fixes style issues in the codebase |


## Building the form for configuration

This project uses [react-jsonschema-form](https://rjsf-team.github.io/react-jsonschema-form/) for configuring the widget properties. For more information consult their [documentation](https://rjsf-team.github.io/react-jsonschema-form/docs/) 
