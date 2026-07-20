import path from 'node:path';
import { homedir } from 'node:os';
function isEnabled(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
function isDevelopmentMode() {
    const explicit = process.env.TMUX_WEB_MODE?.trim().toLowerCase();
    if (explicit === 'development' || explicit === 'dev')
        return true;
    if (isEnabled(process.env.TMUX_WEB_DEV))
        return true;
    return process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
}
export function getDataRoot() {
    return isDevelopmentMode()
        ? path.join(homedir(), '.dev', '.tmux-web')
        : path.join(homedir(), '.tmux-web');
}
export function getConfigRoot() {
    return isDevelopmentMode()
        ? path.join(homedir(), '.dev', '.config')
        : path.join(homedir(), '.config');
}
export function getSettingsPath() {
    return path.join(getConfigRoot(), 'tmux-web', 'settings.json');
}
export function getThemePath() {
    return path.join(getConfigRoot(), 'tmux-web', 'theme.json');
}
export function getPluginDir() {
    return path.join(getDataRoot(), 'node_modules');
}
export function getExtensionDataDir(extId) {
    return path.join(getDataRoot(), 'extensions', extId);
}
export function getUploadsRoot() {
    return path.join(getDataRoot(), 'uploads');
}
