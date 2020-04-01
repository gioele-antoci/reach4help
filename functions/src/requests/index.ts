import {
  Allow,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Max,
  Min,
  validate,
  ValidateNested,
} from 'class-validator';
import * as admin from 'firebase-admin';
import { firestore } from 'firebase-admin';
import * as functions from 'firebase-functions';
import { Change, EventContext } from 'firebase-functions/lib/cloud-functions';
import { DocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import * as moment from 'moment';

import { IUser, User } from '../users';
import GeoPoint = admin.firestore.GeoPoint;
import Timestamp = admin.firestore.Timestamp;

export enum RequestStatus {
  pending = 'pending',
  ongoing = 'ongoing',
  completed = 'completed',
  cancelled = 'cancelled',
  removed = 'removed'
}

export interface IRequest extends FirebaseFirestore.DocumentData {
  cavUserRef: FirebaseFirestore.DocumentReference<IUser> | null;
  pinUserRef: FirebaseFirestore.DocumentReference<IUser>;
  pinUserSnapshot: IUser;
  title: string;
  description: string;
  latLng: GeoPoint;
  status: RequestStatus;
  rating: number | null;
  ratedAt: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export class Request implements IRequest {

  @Allow()
  private _cavUserRef: FirebaseFirestore.DocumentReference<IUser> | null;

  @IsObject()
  private _pinUserRef: FirebaseFirestore.DocumentReference<IUser>;

  @ValidateNested()
  private _pinUserSnapshot: User;

  @IsString()
  @IsNotEmpty()
  private _title: string;

  @IsString()
  @IsNotEmpty()
  private _description: string;

  @IsObject()
  private _latLng: GeoPoint;

  @IsEnum(RequestStatus)
  private _status: RequestStatus;

  /* TODO: When we reach greater than 500 requests created per second:
     https://firebase.google.com/docs/firestore/solutions/shard-timestamp#sharding_a_timestamp_field
   */
  @IsObject()
  private _createdAt: Timestamp;

  /* TODO: When we reach greater than 500 requests updated per second:
     https://firebase.google.com/docs/firestore/solutions/shard-timestamp#sharding_a_timestamp_field
   */
  @IsObject()
  private _updatedAt: Timestamp;

  @IsInt()
  @Min(1)
  @Max(5)
  private _rating: number | null;

  @Allow()
  private _ratedAt: Timestamp | null;

  constructor(
    cavUserRef: FirebaseFirestore.DocumentReference<IUser> | null,
    pinUserRef: FirebaseFirestore.DocumentReference<IUser>,
    pinUserSnapshot: User,
    title: string,
    description: string,
    latLng: GeoPoint,
    status: RequestStatus,
    createdAt = Timestamp.now(),
    updatedAt = Timestamp.now(),
    rating: number | null = null,
    ratedAt: Timestamp | null = null,
  ) {
    this._cavUserRef = cavUserRef;
    this._pinUserRef = pinUserRef;
    this._pinUserSnapshot = pinUserSnapshot;
    this._title = title;
    this._description = description;
    this._latLng = latLng;
    this._status = status;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._rating = rating;
    this._ratedAt = ratedAt;
  }

  static factory = (data: IRequest): Request => new Request(
    data.cavUserRef,
    data.pinUserRef,
    User.factory(data.pinUserSnapshot),
    data.title,
    data.description,
    data.latLng,
    data.status,
    data.createdAt,
    data.updatedAt,
    data.rating,
    data.ratedAt,
  );

  get cavUserRef(): FirebaseFirestore.DocumentReference<IUser> | null {
    return this._cavUserRef;
  }

  set cavUserRef(value: FirebaseFirestore.DocumentReference<IUser> | null) {
    this._cavUserRef = value;
  }

  get pinUserRef(): FirebaseFirestore.DocumentReference<IUser> {
    return this._pinUserRef;
  }

  set pinUserRef(value: FirebaseFirestore.DocumentReference<IUser>) {
    this._pinUserRef = value;
  }

  get pinUserSnapshot(): User {
    return this._pinUserSnapshot;
  }

  set pinUserSnapshot(value: User) {
    this._pinUserSnapshot = value;
  }

  get title(): string {
    return this._title;
  }

  set title(value: string) {
    this._title = value;
  }

  get description(): string {
    return this._description;
  }

  set description(value: string) {
    this._description = value;
  }

  get latLng(): FirebaseFirestore.GeoPoint {
    return this._latLng;
  }

  set latLng(value: FirebaseFirestore.GeoPoint) {
    this._latLng = value;
  }

  get status(): RequestStatus {
    return this._status;
  }

  set status(value: RequestStatus) {
    this._status = value;
  }

  get createdAt(): FirebaseFirestore.Timestamp {
    return this._createdAt;
  }

  set createdAt(value: FirebaseFirestore.Timestamp) {
    this._createdAt = value;
  }

  get updatedAt(): FirebaseFirestore.Timestamp {
    return this._updatedAt;
  }

  set updatedAt(value: FirebaseFirestore.Timestamp) {
    this._updatedAt = value;
  }

  get rating(): number | null {
    return this._rating;
  }

  set rating(value: number | null) {
    this._rating = value;
  }

  get ratedAt(): FirebaseFirestore.Timestamp | null {
    return this._ratedAt;
  }

  set ratedAt(value: FirebaseFirestore.Timestamp | null) {
    this._ratedAt = value;
  }
}

// eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
const queueStatusUpdateTriggers = (change: Change<DocumentSnapshot>, context: EventContext): Promise<void[]> => {
  const requestBefore = change.before.data() ? change.before.data() as Request : null;
  const requestAfter = change.after.data() ? change.after.data() as Request : null;

  const operations: Promise<void>[] = [];

  // A request has just been completed - Update CAV request completed count
  if (requestBefore?.status !== RequestStatus.completed && requestAfter?.status === RequestStatus.completed) {
    // TODO: Update CAV User Ref count for number of cases completed.
    operations.push(Promise.resolve());
  }

  // We have a new record -  Update PIN requests made count
  if (!requestBefore) {
    operations.push(Promise.resolve());
  }

  return Promise.all(operations);
};

// eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
const queueRatingUpdatedTriggers = (change: Change<DocumentSnapshot>, context: EventContext): Promise<void[]> => {
  const requestBefore = change.before ? change.before.data() as Request : null;
  const requestAfter = change.after.data() ? change.after.data() as Request : null;

  const operations: Promise<void>[] = [];

  // We have a new rating -  Update CAV rating average but only this time.
  if (requestBefore?.rating === null && requestAfter?.rating !== null) {
    // TODO: Adjust the avg rating based on the new rating
    operations.push(Promise.resolve());
  } else if (requestBefore?.rating !== null && requestAfter?.rating !== null && requestBefore?.ratedAt && requestAfter?.ratedAt) {
    const previousRatedAt = moment(requestBefore.ratedAt.toDate());
    const fiveMinutesPastPreviousRatedAt = previousRatedAt.add(5, 'minutes');
    const currentRatedAt = moment(requestAfter.ratedAt.toDate());
    if (currentRatedAt.isSameOrBefore(fiveMinutesPastPreviousRatedAt)) {
      // TODO: Adjust the avg rating based on the old rating and the new rating
      operations.push(Promise.resolve());
    }
  }

  return Promise.all(operations);
};

const validateRequest = (value: IRequest): Promise<void> => {
  return validate(Request.factory(value))
    .then(() => {
      return Promise.resolve();
    });
};

export const triggerEventsWhenRequestIsCreated = functions.firestore.document('requests/{requestId}')
  // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
  .onCreate((snapshot: DocumentSnapshot, context: EventContext) => {
    return validateRequest(snapshot.data() as IRequest)
      .catch(errors => {
        console.error('Invalid Request Found: ', errors);
        return firestore()
          .collection('requests').doc(context.params.requestId)
          .delete();
      });
  });

export const triggerEventsWhenRequestIsUpdated = functions.firestore.document('requests/{requestId}')
  .onUpdate((change: Change<DocumentSnapshot>, context: EventContext) => {
    return validateRequest(change.after.data() as IRequest)
      .catch(errors => {
        console.error('Invalid Request Found: ', errors);
        return firestore()
          .collection('requests').doc(context.params.requestId)
          .delete();
      })
      .then(() => {
        return Promise.all([
          queueStatusUpdateTriggers(change, context),
          queueRatingUpdatedTriggers(change, context),
        ]);
      });
  });