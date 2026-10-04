import {
  CanonicalIdSchema,
  verifyCanonicalRecordV1,
} from '@nutrixx/canonical-schema';
import {
  IndexedDbCanonicalRecordRepository,
  sha256Canonical,
} from '@nutrixx/persistence-indexeddb';
import {
  StartingProfileServiceV1,
  type StartingProfileV1,
} from '@nutrixx/user-context';

import {
  LOCAL_USER_DATABASE_NAME,
  ONBOARDING_LOCATOR_STORAGE_KEY,
} from './storage-constants';

export { ONBOARDING_LOCATOR_STORAGE_KEY };

export interface StartingProfileFormValues {
  readonly ageYears: number;
  readonly heightCentimeters: string;
  readonly weightKilograms: string;
  readonly physiologicalReference: 'female' | 'male' | 'unsure';
  readonly primaryGoal: 'maintain' | 'lose' | 'gain';
  readonly foodRestrictions: readonly string[];
}

interface OnboardingLocator {
  readonly profileId: string;
  readonly ownerSubjectId: string;
}

export interface BrowserOnboardingDependencies {
  readonly storage: Storage;
  readonly indexedDB: IDBFactory;
  readonly keyRange: typeof IDBKeyRange;
  readonly createId: () => string;
  readonly now: () => string;
  readonly timeZone: () => string;
}

export class OnboardingStorageError extends Error {
  public constructor(
    public readonly code: 'locator-unavailable' | 'database-unavailable',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OnboardingStorageError';
  }
}

function canonicalDecimal(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError('A finite profile measurement is required.');
  }
  return parsed.toString();
}

function parseLocator(value: string | null): OnboardingLocator | null {
  if (value === null) return null;
  try {
    const candidate = JSON.parse(value) as Record<string, unknown>;
    const profileId = CanonicalIdSchema.parse(candidate['profileId']);
    const ownerSubjectId = CanonicalIdSchema.parse(candidate['ownerSubjectId']);
    return { profileId, ownerSubjectId };
  } catch {
    return null;
  }
}

function defaultDependencies(): BrowserOnboardingDependencies {
  return {
    storage: localStorage,
    indexedDB,
    keyRange: IDBKeyRange,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

export class BrowserOnboardingStore {
  private readonly dependencies: BrowserOnboardingDependencies;

  public constructor(
    dependencies: BrowserOnboardingDependencies = defaultDependencies(),
  ) {
    this.dependencies = dependencies;
  }

  private readLocator(): OnboardingLocator | null {
    try {
      return parseLocator(
        this.dependencies.storage.getItem(ONBOARDING_LOCATOR_STORAGE_KEY),
      );
    } catch (error) {
      throw new OnboardingStorageError(
        'locator-unavailable',
        'The local onboarding locator is unavailable.',
        { cause: error },
      );
    }
  }

  private createLocator(): OnboardingLocator {
    const locator = {
      profileId: CanonicalIdSchema.parse(this.dependencies.createId()),
      ownerSubjectId: CanonicalIdSchema.parse(this.dependencies.createId()),
    };
    try {
      this.dependencies.storage.setItem(
        ONBOARDING_LOCATOR_STORAGE_KEY,
        JSON.stringify(locator),
      );
      return locator;
    } catch (error) {
      throw new OnboardingStorageError(
        'locator-unavailable',
        'The local onboarding locator cannot be retained.',
        { cause: error },
      );
    }
  }

  private async withService<T>(
    operation: (service: StartingProfileServiceV1) => Promise<T>,
  ): Promise<T> {
    let repository: IndexedDbCanonicalRecordRepository | undefined;
    try {
      repository = await IndexedDbCanonicalRecordRepository.create({
        databaseName: LOCAL_USER_DATABASE_NAME,
        indexedDB: this.dependencies.indexedDB,
        keyRange: this.dependencies.keyRange,
        verifyRecord: (record) =>
          verifyCanonicalRecordV1(record, sha256Canonical),
      });
      return await operation(
        new StartingProfileServiceV1({
          repository,
          digestSha256Hex: sha256Canonical,
        }),
      );
    } catch (error) {
      if (error instanceof OnboardingStorageError) throw error;
      throw new OnboardingStorageError(
        'database-unavailable',
        'The local profile database is unavailable.',
        { cause: error },
      );
    } finally {
      await repository?.close();
    }
  }

  public async load(): Promise<StartingProfileV1 | null> {
    const locator = this.readLocator();
    if (locator === null) return null;
    return this.withService((service) => service.get(locator.profileId));
  }

  public async save(
    values: StartingProfileFormValues,
  ): Promise<StartingProfileV1> {
    const locator = this.readLocator() ?? this.createLocator();
    return this.withService(async (service) => {
      const existing = await service.get(locator.profileId);
      const savedAt = this.dependencies.now();
      const result = await service.save({
        profileId: locator.profileId,
        ownerSubjectId: locator.ownerSubjectId,
        ageYears: values.ageYears,
        heightCentimeters: canonicalDecimal(values.heightCentimeters),
        weightKilograms: canonicalDecimal(values.weightKilograms),
        physiologicalReference: values.physiologicalReference,
        primaryGoal: values.primaryGoal,
        foodRestrictions: [...values.foodRestrictions],
        timeZone: this.dependencies.timeZone(),
        adultConfirmedAt: existing?.adultConfirmedAt ?? savedAt,
        savedAt,
      });
      return result.profile;
    });
  }
}

export function clearOnboardingLocator(): void {
  try {
    localStorage.removeItem(ONBOARDING_LOCATOR_STORAGE_KEY);
  } catch {
    // Canonical database deletion remains authoritative.
  }
}
