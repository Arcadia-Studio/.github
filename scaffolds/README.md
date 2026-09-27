# scaffolds

Staging area for new repositories that have not been created yet. Nothing here
is organization configuration.

GitHub reads organization-wide community health defaults from this repository's
**root** and from a root-level `.github/` directory: a root `CONTRIBUTING.md`,
`SECURITY.md`, `ISSUE_TEMPLATE/`, and so on apply to every repository in the
organization. Paths nested under `scaffolds/` are inert, which is why the
scaffolds keep their own `.github/` directories down here. Do not move any of
those files to the repository root.

## Contents

| Directory | Intended destination |
|---|---|
| `obsidian-arcadia-lectern/` | A new `Arcadia-Studio/obsidian-arcadia-lectern` repository |

## Moving a scaffold to its own repository

1. Create the empty repository on GitHub, with no README, license, or
   `.gitignore` (the scaffold supplies all three).
2. From this checkout:

   ```bash
   cd scaffolds/obsidian-arcadia-lectern
   git init -b main
   git add .
   git commit -m "Initial scaffold"
   git remote add origin https://github.com/Arcadia-Studio/obsidian-arcadia-lectern.git
   git push -u origin main
   ```

3. Verify the Build workflow passes on the new repository.
4. Delete the directory from `scaffolds/` in a follow-up commit here, so the
   staging area never becomes a second copy that drifts.
