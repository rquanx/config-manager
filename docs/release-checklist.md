# Release Checklist

## Before Releasing

- run `pnpm lint`
- run `pnpm test`
- run `pnpm pack:check`
- review `README.md`
- review `CHANGELOG.md`
- confirm `package.json` version is correct

## Publish

```bash
pnpm publish --access public
```

## After Publishing

- verify the package page on npm
- install the published package globally in a clean shell
- run `config-manager --version`
- run `config-manager --help`
