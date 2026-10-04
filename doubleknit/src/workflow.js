import { message, translate } from './i18n.js';

export function workflowMessages(workflow) {
  const round = workflow === 'in-the-round';
  return Object.fromEntries(Object.entries({
    name: round ? 'round' : 'flat', unit: round ? 'unitRound' : 'row',
    units: round ? 'rounds' : 'rows', label: round ? 'Round' : 'Row',
    labels: round ? 'Rounds' : 'Rows', reading: round ? 'readRound' : 'readFlat',
  }).map(([key, value]) => [key, message(`workflow.${value}`)]));
}
export function workflowText(workflow, locale = 'en-GB') {
  return Object.fromEntries(Object.entries(workflowMessages(workflow))
    .map(([key, value]) => [key, translate(value, locale)]));
}

// Only the linked Plus working chart is read relative to the face facing the knitter.
export function faceRelativePlus(project) {
  return project?.mode === 'double-faced' && project.identicalPatterns
    && project.display.notation === 'plus';
}
export function workingDirection(project, number) {
  return project.workflow === 'in-the-round' || faceRelativePlus(project) || number % 2 === 1
    ? 'right-to-left' : 'left-to-right';
}
