import { variableInput } from "../shared/environment";
import type { z } from "zod";
interface SavedVariableActions {
  save(variable: z.infer<typeof variableInput>): Promise<void>;
  remove(name: string): Promise<void>;
}
interface SavedVariableState {
  mode: "view" | "replace" | "confirm-remove" | "removed";
  status: "idle" | "pending" | "success" | "error";
  description: string;
  value: string;
  message: string;
}

export class SavedVariableEditor {
  private state: SavedVariableState = {
    mode: "view",
    status: "idle",
    description: "",
    value: "",
    message: "",
  };
  private listeners = new Set<() => void>();
  constructor(
    readonly name: string,
    private actions: SavedVariableActions,
  ) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<SavedVariableState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  beginReplacement(description: string) {
    if (this.state.status === "pending") return;
    this.publish({ mode: "replace", status: "idle", description, value: "", message: "" });
  }
  set(field: "description" | "value", value: string) {
    if (this.state.mode !== "replace" || this.state.status === "pending") return;
    this.publish({ [field]: value, status: "idle", message: "" });
  }
  cancel = () => {
    if (this.state.status === "pending") return;
    this.publish({ mode: "view", status: "idle", value: "", description: "", message: "" });
  };
  confirmRemove = () => {
    if (this.state.status === "pending") return;
    this.publish({ mode: "confirm-remove", status: "idle", value: "", message: "" });
  };
  async save() {
    if (this.state.mode !== "replace" || this.state.status === "pending") return;
    const parsed = variableInput.safeParse({
      name: this.name,
      description: this.state.description,
      value: this.state.value,
    });
    if (!parsed.success) {
      this.publish({
        status: "error",
        message: "Enter a new value (up to 16 KiB) and a description up to 500 characters.",
      });
      return;
    }
    this.publish({ status: "pending", value: "", message: "Saving…" });
    try {
      await this.actions.save(parsed.data);
      this.publish({
        mode: "view",
        status: "success",
        description: "",
        message: "Value updated. The next environment command will use it.",
      });
    } catch {
      this.publish({
        status: "error",
        message: "Could not update this variable. Re-enter the value and try again.",
      });
    }
  }
  async remove() {
    if (this.state.mode !== "confirm-remove" || this.state.status === "pending") return;
    this.publish({ status: "pending", message: "Removing…" });
    try {
      await this.actions.remove(this.name);
      this.publish({ mode: "removed", status: "success", message: `${this.name} removed.` });
    } catch {
      this.publish({ status: "error", message: "Could not remove this variable. Try again." });
    }
  }
}
