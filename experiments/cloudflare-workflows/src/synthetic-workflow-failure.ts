import { Data } from 'effect';

export class SyntheticWorkflowFailure extends Data.TaggedError('SyntheticWorkflowFailure')<{
  readonly message: string;
}> {}
