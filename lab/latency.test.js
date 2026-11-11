import { expect, it } from 'vitest';
import { latencySample, summarizeBreakdown } from './latency.js';

it('separates actual event execution, render queueing, Commit and frame without changing total latency', () => {
  const sample = latencySample({ intendedAt:100,timeStamp:105,executedAt:110,renderStartAt:130 },170,160);
  expect(sample).toMatchObject({main:70,event:65,plannedToEvent:10,eventToRender:20,renderToCommit:30,commitToFrame:10});
  expect(sample.plannedToEvent+sample.eventToRender+sample.renderToCommit+sample.commitToFrame).toBe(sample.main);
  expect(summarizeBreakdown([sample,latencySample({timeStamp:1},10,8)],'input')).toMatchObject({inputBreakdownCount:1,inputEventToRenderP95:20});
});
