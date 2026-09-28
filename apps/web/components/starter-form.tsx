import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@heroui/react';

type StarterFormProps = {
  heading?: string;
};

const selectClassName = 'w-full';

export function StarterForm({
  heading = 'Build your starting point',
}: StarterFormProps) {
  return (
    <div className="rounded-[2rem] border border-separator bg-surface/90 p-6 shadow-2xl shadow-black/5 backdrop-blur sm:p-8 dark:shadow-black/25">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          About one minute
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Only the inputs needed for an initial nutrition estimate. You can
          refine everything later.
        </p>
      </div>

      <form
        aria-label="Nutrition starting profile"
        action="/dashboard"
        className="space-y-6"
        method="get"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField isRequired className="flex flex-col gap-2">
            <Label>Age</Label>
            <Input max={120} min={18} placeholder="32" type="number" />
          </TextField>
          <TextField isRequired className="flex flex-col gap-2">
            <Label>Height (cm)</Label>
            <Input max={250} min={100} placeholder="172" type="number" />
          </TextField>
          <TextField isRequired className="flex flex-col gap-2">
            <Label>Weight (kg)</Label>
            <Input max={350} min={30} placeholder="68" type="number" />
          </TextField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            isRequired
            className={selectClassName}
            placeholder="Choose a reference"
          >
            <Label>Physiological reference</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="female" textValue="Female reference">
                  Female reference
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="male" textValue="Male reference">
                  Male reference
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="unsure" textValue="I am not sure">
                  I am not sure
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            isRequired
            className={selectClassName}
            placeholder="Choose your goal"
          >
            <Label>Primary goal</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="maintain" textValue="Maintain weight">
                  Maintain weight
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="lose" textValue="Lose weight">
                  Lose weight
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="gain" textValue="Gain weight">
                  Gain weight
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <TextField className="flex flex-col gap-2">
          <Label>Food restrictions or allergies</Label>
          <Input placeholder="For example: vegetarian, peanut allergy" />
        </TextField>

        <label className="flex items-start gap-3 rounded-2xl border border-separator bg-background/55 p-4 text-sm leading-6">
          <input
            required
            aria-describedby="adult-confirmation-note"
            className="mt-1 size-4 accent-[var(--color-accent)]"
            type="checkbox"
          />
          <span id="adult-confirmation-note">
            I confirm that I am at least 18 years old and understand that
            Nutrixx provides general wellness guidance, not medical advice.
          </span>
        </label>

        <Button className="w-full" type="submit" variant="primary">
          Preview my dashboard
        </Button>

        <p className="text-center text-xs leading-5 text-muted">
          Product skeleton: this form does not save or transmit your entries.
        </p>
      </form>
    </div>
  );
}
