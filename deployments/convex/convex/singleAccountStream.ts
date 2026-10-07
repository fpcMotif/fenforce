import { QueryStream, type IndexBounds } from 'convex-helpers/server/stream';

import type { Id } from './_generated/dataModel';

export class SingleAccountStream<
  TDocument extends NonNullable<unknown>,
> extends QueryStream<TDocument> {
  private readonly documents: QueryStream<TDocument>;
  private readonly accountId: Id<'workspaceCompanies'>;

  constructor(
    documents: QueryStream<TDocument>,
    accountId: Id<'workspaceCompanies'>,
  ) {
    super();
    this.documents = documents;
    this.accountId = accountId;
  }

  iterWithKeys(trackBandwidth?: boolean) {
    return this.documents.iterWithKeys(trackBandwidth);
  }

  getOrder() {
    return this.documents.getOrder();
  }

  getIndexFields() {
    return this.documents.getIndexFields();
  }

  getEqualityIndexFilter() {
    return this.documents.getEqualityIndexFilter();
  }

  narrow(indexBounds: IndexBounds) {
    return new SingleAccountStream(
      this.documents.narrow(this.boundsReadFromThisAccount(indexBounds)),
      this.accountId,
    );
  }

  private boundsReadFromThisAccount(indexBounds: IndexBounds): IndexBounds {
    const ownsLowerBound = indexBounds.lowerBound[0] === this.accountId;
    const ownsUpperBound = indexBounds.upperBound[0] === this.accountId;
    return {
      lowerBound: ownsLowerBound ? indexBounds.lowerBound : [],
      lowerBoundInclusive: ownsLowerBound
        ? indexBounds.lowerBoundInclusive
        : true,
      upperBound: ownsUpperBound ? indexBounds.upperBound : [],
      upperBoundInclusive: ownsUpperBound
        ? indexBounds.upperBoundInclusive
        : true,
    };
  }
}
