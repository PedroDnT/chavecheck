type Command = { eventId: string; revision: number; delegationId?: string };
type Delegation = { revision: number; clientEventId?: string; awaitingFirstResponse: boolean };

/** Correlate app response.create commands without releasing the lock at delegation.created. */
export class LiveResponseTracker {
  private pending: Command | null = null;
  private commands = new Map<string, number>();
  private delegations = new Map<string, Delegation>();

  get pendingCount() { return this.pending ? 1 : 0; }

  issued(eventId: string, revision: number): boolean {
    if (this.pending || this.commands.has(eventId)) return false;
    this.pending = { eventId, revision };
    // Keep the revision after failure too: a delayed server event must not become current.
    this.commands.set(eventId, revision);
    return true;
  }

  failed(eventId: string): boolean {
    if (this.pending?.eventId !== eventId) return false;
    this.pending = null;
    return true;
  }

  delegated(delegationId: string, clientEventId: string | undefined, currentRevision: number): void {
    const existing = this.delegations.get(delegationId);
    if (existing && existing.clientEventId === clientEventId) return;
    const issuedRevision = clientEventId === undefined ? undefined : this.commands.get(clientEventId);
    this.delegations.set(delegationId, {
      revision: issuedRevision ?? currentRevision,
      clientEventId,
      awaitingFirstResponse: true,
    });
    if (clientEventId !== undefined && this.pending?.eventId === clientEventId) {
      this.pending.delegationId = delegationId;
    }
  }

  created(delegationId: string, currentRevision: number): number {
    const delegation = this.delegations.get(delegationId);
    if (delegation?.awaitingFirstResponse) {
      delegation.awaitingFirstResponse = false;
      if (delegation.clientEventId !== undefined && this.pending?.eventId === delegation.clientEventId) this.pending = null;
      // An explicitly announced automatic delegation cannot consume an unrelated app command.
      return delegation.revision;
    }

    // Live continuations reuse their delegation without another delegation.created event.
    // The hook serializes app commands, so the single unbound command is that continuation.
    if (this.pending && (!this.pending.delegationId || this.pending.delegationId === delegationId)) {
      const command = this.pending;
      this.pending = null;
      this.delegations.set(delegationId, {
        revision: command.revision, clientEventId: command.eventId, awaitingFirstResponse: false,
      });
      return command.revision;
    }
    return delegation?.revision ?? currentRevision;
  }

  clear(): void {
    this.pending = null;
    this.commands.clear();
    this.delegations.clear();
  }
}
