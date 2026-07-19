import { darkCoveTheme } from './dark-cove.js';
import { ghosttyTheme } from './ghostty.js';
import { vscodeTheme } from './vscode.js';
import { warmClayTheme } from './warm-clay.js';
export { darkCoveTheme } from './dark-cove.js';
export { ghosttyTheme } from './ghostty.js';
export { vscodeTheme } from './vscode.js';
export { warmClayTheme } from './warm-clay.js';
const TEMPLATES = {
    vscode: vscodeTheme,
    ghostty: ghosttyTheme,
    'warm-clay': warmClayTheme,
    'dark-cove': darkCoveTheme,
};
export const THEME_TEMPLATE_IDS = Object.keys(TEMPLATES);
export function getThemeTemplates() {
    return TEMPLATES;
}
export function resolveTheme(templateId) {
    const theme = TEMPLATES[templateId];
    if (!theme) {
        throw new Error(`unknown theme template: ${templateId}`);
    }
    return structuredClone(theme);
}
export function isThemeTemplateId(value) {
    return value === 'vscode' || value === 'ghostty' || value === 'warm-clay' || value === 'dark-cove';
}
