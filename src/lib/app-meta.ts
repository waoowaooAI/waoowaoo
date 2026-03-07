import packageJson from '../../package.json'

const GITHUB_REPOSITORY_VALUE = 'saturndec/waoowaoo'

const packageVersion = packageJson.version
if (typeof packageVersion !== 'string' || packageVersion.trim().length === 0) {
  throw new Error('Invalid package.json version')
}

export const APP_VERSION = packageVersion.trim()

export const GITHUB_REPOSITORY = GITHUB_REPOSITORY_VALUE

if (!GITHUB_REPOSITORY) {
  throw new Error('Missing GitHub repository configuration')
}
