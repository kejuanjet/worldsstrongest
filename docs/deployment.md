# Deployment and Packaging

This project currently ships as a Vite web build with an Electron shell that loads a URL. The preferred path beyond the dev scripts is:

1. Verify the repository with `npm run check`.
2. Produce the production web bundle with `npm run build`.
3. Publish the `dist/` folder to staging or static hosting.
4. Point Electron at the staged URL by setting `GAME_URL` before launching `electron-main.js`.

## CI output

The GitHub Actions workflow at [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs `npm run check` and `npm run build` on every push and pull request. On push, it also uploads the built `dist/` directory as a workflow artifact.

## Staging deployment

For a staging environment, deploy the contents of `dist/` to any static host or internal file server. The app does not need a special backend for that path.

Example local staging preview:

```sh
npm run build
npx vite preview --host 0.0.0.0 --port 4173
```

## Desktop packaging

The repo does not yet include an installer packager such as electron-builder or Electron Forge. If you want distributable installers, the next step is to add one of those tools, then wire a dedicated packaging script that bundles the Electron shell plus the built web assets.

## Large assets

GitHub warned about large model files during the first push. The repository now tracks `*.glb` and `*.Fbx` through Git LFS for future changes. If you add or replace large binary assets, install Git LFS locally and run `git lfs track` for the new file types before committing.

Until then, the practical desktop path is:

```sh
npm run build
set GAME_URL=http://your-staging-host/
node electron-main.js
```

## Notes

- `RUN_DESKTOP.BAT` and `IGNITION_LIVE.BAT` are still the fastest local desktop launchers.
- `run.bat` serves the built output from `dist/` when available, which is useful for validating the production bundle locally.