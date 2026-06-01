import { useState } from "react";

interface FieldUpdate {
  field: string;
  value: string;
}

type FieldKey = keyof FieldUpdate;

export default function useFieldUpdates() {
  const [fieldsToUpdate, setFieldsToUpdate] = useState<FieldUpdate[]>([
    { field: "", value: "" },
  ]);

  const handleFieldUpdate = (index: number, key: FieldKey, value: string) => {
    const updatedFields = [...fieldsToUpdate];
    updatedFields[index][key] = value;
    setFieldsToUpdate(updatedFields);
  };

  const handleAddField = () => {
    setFieldsToUpdate((prev) => [...prev, { field: "", value: "" }]);
  };

  const handleRemoveField = (index: number) => {
    if (fieldsToUpdate.length > 1) {
      setFieldsToUpdate((prev) => prev.filter((_, i) => i !== index));
    }
  };

  return {
    fieldsToUpdate,
    setFieldsToUpdate,
    handleFieldUpdate,
    handleAddField,
    handleRemoveField,
  };
}