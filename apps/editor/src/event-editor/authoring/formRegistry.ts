export type CapabilityKind = "trigger" | "condition" | "handler_params" | "node";

export type FormInputKind =
  | "text"
  | "number"
  | "boolean"
  | "json"
  | "select"
  | "target_ref"
  | "condition"
  | "condition_list";

export interface FormSelectOption {
  value: string;
  label: string;
  description?: string;
  meta?: unknown;
}

export interface FormFieldConfig {
  path: string;
  label: string;
  input: FieldInput;
  description: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: readonly FormSelectOption[];
  allowMultiple?: boolean;
}

export type FieldInput = FormInputKind;
export type SelectFieldOption = FormSelectOption;

export interface CapabilityDefinition<
  TKind extends CapabilityKind,
  TType extends string,
  TTemplate extends object,
> {
  kind: TKind;
  type: TType;
  label: string;
  description: string;
  fields: readonly FormFieldConfig[];
  template: TTemplate;
  requiredFields: readonly string[];
  commonUse: string;
}

export function defineField(config: FormFieldConfig): FormFieldConfig {
  return config;
}
