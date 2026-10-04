import {checkLegend} from './legend-browser-checks.mjs';
import {checkPdfLayout} from './pdf-layout-browser-checks.mjs';
// Optional external tooling. The app itself has no install or build step.
import {checkUiCorrections} from './ui-corrections-checks.mjs';
import {checkWorkspace} from './workspace-browser-checks.mjs';
import {checkWorkspaceFlows} from './workspace-flows.mjs';
import {checkWorkspaceScale} from './workspace-scale.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=process.env.CHROMIUM_CDP_URL ? await chromium.connectOverCDP(process.env.CHROMIUM_CDP_URL)
 : await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined});
const url=process.env.APP_URL || 'http://127.0.0.1:8080';
const checks={legend:checkLegend,'pdf-layout':checkPdfLayout,corrections:checkUiCorrections,workspace:checkWorkspace,flows:checkWorkspaceFlows,scale:checkWorkspaceScale};
try {
 const group=process.env.BROWSER_CHECK;
 if(group && !checks[group]) throw Error('BROWSER_CHECK must be legend, pdf-layout, corrections, workspace, flows or scale. Omit it for all current checks.');
 for(const check of group ? [checks[group]] : Object.values(checks)) await check(browser,url);
 console.log('PASS workspace browser acceptance');
} finally {await browser.close();}
