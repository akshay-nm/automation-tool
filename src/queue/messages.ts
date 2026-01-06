// Queue message types
export interface StartRunMessage {
  type: 'START_RUN';
  runId: string;
  workflowId: string;
}

export interface ExecuteStepMessage {
  type: 'EXECUTE_STEP';
  runId: string;
  workflowId: string;
  stepIndex: number;
  stepId: string;
  attempt: number;
}

export interface CompleteRunMessage {
  type: 'COMPLETE_RUN';
  runId: string;
  status: 'completed' | 'failed';
}

export type QueueMessage =
  | StartRunMessage
  | ExecuteStepMessage
  | CompleteRunMessage;
