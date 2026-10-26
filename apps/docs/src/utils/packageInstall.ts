export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Return the package specifier appropriate for the version shown by the docs site. */
export function packageSpecifierForVersion(version: string): string {
  const prereleaseIdentifier = version.split('-', 2)[1]?.split('.', 1)[0];
  return prereleaseIdentifier ? `@re-code/flux@${prereleaseIdentifier}` : '@re-code/flux';
}

/** Keep copyable install commands aligned with the stable or prerelease docs build. */
export function installCommandForManager(manager: PackageManager, version: string): string {
  const packageSpecifier = packageSpecifierForVersion(version);
  const commands: Record<PackageManager, string> = {
    npm: `npm install ${packageSpecifier} rxjs`,
    pnpm: `pnpm add ${packageSpecifier} rxjs`,
    yarn: `yarn add ${packageSpecifier} rxjs`,
    bun: `bun add ${packageSpecifier} rxjs`,
  };

  return commands[manager];
}

/** Apply the release channel to a localized npm command without localizing package names. */
export function versionInstallCommand(command: string, version: string): string {
  return command.replace('@re-code/flux', packageSpecifierForVersion(version));
}
