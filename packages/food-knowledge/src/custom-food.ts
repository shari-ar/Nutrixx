import * as z from 'zod';

import {
  CanonicalCodeSchema,
  CanonicalIdSchema,
  NonnegativeCanonicalDecimalSchema,
  UtcInstantSchema,
  createCanonicalRecordV1Schema,
  sealCanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';
import type {
  AtomicCanonicalRecordRepository,
  CanonicalTransactionResult,
} from '@nutrixx/persistence';

import { FoodCompositionValueV1Schema } from './model.js';

const PositiveDecimalSchema = NonnegativeCanonicalDecimalSchema.refine(
  (value) => value !== '0',
  'The value must be greater than zero.',
);

export const CustomFoodPortionV1Schema = z.strictObject({
  portionId: CanonicalIdSchema,
  label: z.string().trim().min(1).max(200),
  gramWeight: PositiveDecimalSchema,
});

export const CustomFoodVersionV1Schema = z
  .strictObject({
    foodId: CanonicalIdSchema,
    ownerSubjectId: CanonicalIdSchema,
    revision: z.int().positive(),
    name: z.string().trim().min(1).max(500),
    approximatePriceUsdPer100g: NonnegativeCanonicalDecimalSchema.optional(),
    preparationState: CanonicalCodeSchema,
    categories: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    portions: z.array(CustomFoodPortionV1Schema).min(1).max(50),
    composition: z
      .array(
        z.strictObject({
          nutrientId: CanonicalCodeSchema,
          value: FoodCompositionValueV1Schema,
        }),
      )
      .max(500),
    publishedAt: UtcInstantSchema,
  })
  .superRefine((food, context) => {
    const portionLabels = food.portions.map((portion) =>
      portion.label.toLocaleLowerCase('und'),
    );
    if (new Set(portionLabels).size !== portionLabels.length) {
      context.addIssue({
        code: 'custom',
        path: ['portions'],
        message: 'Portion labels must be unique.',
      });
    }
    const nutrientIds = food.composition.map(
      (component) => component.nutrientId,
    );
    if (new Set(nutrientIds).size !== nutrientIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['composition'],
        message: 'Nutrient identifiers must be unique.',
      });
    }
  });

export const CustomFoodHeadV1Schema = z.strictObject({
  foodId: CanonicalIdSchema,
  ownerSubjectId: CanonicalIdSchema,
  activeRevision: z.int().positive(),
  activeVersionRecordId: CanonicalIdSchema,
});

export const SaveCustomFoodCommandV1Schema = z.strictObject({
  commandId: z.string().trim().min(1).max(200),
  versionRecordId: CanonicalIdSchema,
  expectedPreviousVersionRecordId: CanonicalIdSchema.optional(),
  food: CustomFoodVersionV1Schema,
});

export const CustomFoodVersionRecordV1Schema = createCanonicalRecordV1Schema(
  'food.custom-version',
  1,
  CustomFoodVersionV1Schema,
).refine(
  (record) =>
    record.owningContext === 'food-knowledge' &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.logicalVersion === record.payload.revision,
  { message: 'Custom food version envelope is invalid.' },
);

export const CustomFoodHeadRecordV1Schema = createCanonicalRecordV1Schema(
  'food.custom-head',
  1,
  CustomFoodHeadV1Schema,
).refine(
  (record) =>
    record.recordId === record.payload.foodId &&
    record.owningContext === 'food-knowledge' &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.logicalVersion === record.payload.activeRevision,
  { message: 'Custom food head envelope is invalid.' },
);

export type CustomFoodVersionV1 = z.infer<typeof CustomFoodVersionV1Schema>;
export type SaveCustomFoodCommandV1 = z.infer<
  typeof SaveCustomFoodCommandV1Schema
>;

export interface CustomFoodLedgerV1Options {
  readonly repository: AtomicCanonicalRecordRepository;
  readonly digestSha256Hex: Sha256HexDigest;
}

export class CustomFoodLedgerV1 {
  readonly #repository: AtomicCanonicalRecordRepository;
  readonly #digest: Sha256HexDigest;

  public constructor(options: CustomFoodLedgerV1Options) {
    this.#repository = options.repository;
    this.#digest = options.digestSha256Hex;
  }

  public async save(
    input: SaveCustomFoodCommandV1,
  ): Promise<CanonicalTransactionResult> {
    const command = SaveCustomFoodCommandV1Schema.parse(input);
    const existingInput = await this.#repository.getById(command.food.foodId);
    const existing =
      existingInput === null
        ? null
        : CustomFoodHeadRecordV1Schema.parse(existingInput);
    const expectedRevision = (existing?.payload.activeRevision ?? 0) + 1;
    if (command.food.revision !== expectedRevision) {
      throw new TypeError(
        `Custom food revision ${expectedRevision} is required.`,
      );
    }
    if (
      existing === null
        ? command.expectedPreviousVersionRecordId !== undefined
        : command.expectedPreviousVersionRecordId !==
          existing.payload.activeVersionRecordId
    ) {
      throw new TypeError(
        'The custom food update is based on a stale version.',
      );
    }
    if (
      existing !== null &&
      existing.payload.ownerSubjectId !== command.food.ownerSubjectId
    ) {
      throw new TypeError('A custom food cannot change ownership.');
    }

    const provenance = {
      method: 'user-entered' as const,
      source: { kind: 'user' as const, sourceId: command.food.ownerSubjectId },
      recordedAt: command.food.publishedAt,
    };
    const versionRecord = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'food.custom-version',
        recordVersion: 1,
        recordId: command.versionRecordId,
        subjectId: command.food.ownerSubjectId,
        owningContext: 'food-knowledge',
        logicalVersion: command.food.revision,
        createdAt: command.food.publishedAt,
        updatedAt: command.food.publishedAt,
        ...(existing === null
          ? {}
          : { correctionOf: existing.payload.activeVersionRecordId }),
        provenance,
        payload: command.food as unknown as JsonValue,
      },
      this.#digest,
    );
    const headRecord = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'food.custom-head',
        recordVersion: 1,
        recordId: command.food.foodId,
        subjectId: command.food.ownerSubjectId,
        owningContext: 'food-knowledge',
        logicalVersion: command.food.revision,
        createdAt: existing?.createdAt ?? command.food.publishedAt,
        updatedAt: command.food.publishedAt,
        provenance,
        payload: {
          foodId: command.food.foodId,
          ownerSubjectId: command.food.ownerSubjectId,
          activeRevision: command.food.revision,
          activeVersionRecordId: command.versionRecordId,
        },
      },
      this.#digest,
    );
    return this.#repository.commit({
      commandId: command.commandId,
      occurredAt: command.food.publishedAt,
      mutations: [
        { kind: 'put', record: headRecord },
        { kind: 'put', record: versionRecord },
      ],
    });
  }

  public async listCurrent(
    ownerSubjectId: string,
  ): Promise<readonly CustomFoodVersionV1[]> {
    const records = await this.#repository.listBySubject(ownerSubjectId);
    const heads = records.flatMap((record) => {
      const result = CustomFoodHeadRecordV1Schema.safeParse(record);
      return result.success ? [result.data.payload] : [];
    });
    const foods = await Promise.all(
      heads.map(async (head) => {
        const record = await this.#repository.getById(
          head.activeVersionRecordId,
        );
        return record === null
          ? null
          : CustomFoodVersionRecordV1Schema.parse(record).payload;
      }),
    );
    return foods
      .filter((food): food is CustomFoodVersionV1 => food !== null)
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  }

  public async history(
    ownerSubjectId: string,
    foodId: string,
  ): Promise<readonly CustomFoodVersionV1[]> {
    return (await this.#repository.listBySubject(ownerSubjectId))
      .flatMap((record) => {
        const result = CustomFoodVersionRecordV1Schema.safeParse(record);
        return result.success && result.data.payload.foodId === foodId
          ? [result.data.payload]
          : [];
      })
      .sort((left, right) => left.revision - right.revision);
  }
}
