import packageJson from '../../package.json';

/**
 * Application version from package.json. Semantic-release updates this file;
 * do not hardcode a version elsewhere in the UI.
 */
export const APP_VERSION: string = packageJson.version;
