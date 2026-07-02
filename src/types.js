import { z } from 'zod';
const NullableString = z.string().min(1).nullable();
const NullableNumber = z.number().finite().nullable();
const JsonRecord = z.record(z.string(), z.unknown());
export const NoticeSchema = z.object({
    source: z.string().min(1),
    sourceId: z.string().min(1),
    title: z.string().min(1),
    stableKey: z.string().min(1),
    changeHash: z.string().min(1),
    status: NullableString,
    region: NullableString,
    targetTags: z.array(z.string()),
    postedAt: NullableString,
    applicationStartAt: NullableString,
    applicationEndAt: NullableString,
    sourceUrl: NullableString,
    metadata: JsonRecord,
});
export const ListingSchema = z.object({
    source: z.string().min(1),
    noticeSourceId: z.string().min(1),
    title: z.string().min(1),
    stableKey: z.string().min(1),
    changeHash: z.string().min(1),
    supplyType: NullableString,
    region: NullableString,
    targetTags: z.array(z.string()),
    deposit: NullableNumber,
    monthlyRent: NullableNumber,
    floorAreaM2: NullableNumber,
    status: NullableString,
    metadata: JsonRecord,
});
export const SourceRunSchema = z.object({
    source: z.string().min(1),
    startedAt: z.string().min(1),
    finishedAt: z.string().min(1),
    status: z.enum(['success', 'partial', 'failure']),
    message: NullableString,
});
export const PersonalProfileSchema = z.object({
    birthYear: z.number().int().min(1900).max(2100).nullable(),
    isHomeless: z.boolean().nullable(),
    residenceRegion: NullableString,
    householdSize: z.number().int().positive().nullable(),
    monthlyIncome: NullableNumber,
    totalAssets: NullableNumber,
    vehicleValue: NullableNumber,
    subscriptionAccountMonths: z.number().int().nonnegative().nullable(),
    subscriptionPaymentCount: z.number().int().nonnegative().nullable(),
    interestTags: z.array(z.string()),
});
export const NotificationEventSchema = z.object({
    type: z.enum(['new_notice', 'listing_added', 'listing_changed']),
    notice: NoticeSchema,
    listing: ListingSchema.nullable(),
    previousNotice: NoticeSchema.nullable().optional(),
    previousListing: ListingSchema.nullable().optional(),
    occurredAt: z.string().min(1),
});
export const QueryFiltersSchema = z.object({
    source: z.string().min(1).nullable().optional(),
    region: z.string().min(1).nullable().optional(),
    status: z.string().min(1).nullable().optional(),
    targetTags: z.array(z.string()).optional(),
    noticeTypes: z.array(z.enum(['분양', '임대', '상가', '신혼부부', '청년'])).optional(),
    excludedNoticeTypes: z.array(z.enum(['분양', '임대', '상가'])).optional(),
    applicationState: z.enum(['open', 'notClosed']).optional(),
    postedAfter: z.string().min(1).nullable().optional(),
    postedBefore: z.string().min(1).nullable().optional(),
});
