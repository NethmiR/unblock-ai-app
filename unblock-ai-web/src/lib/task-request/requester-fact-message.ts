import { TASK_REQUEST_COPY } from "./task-request-copy";
import { RequesterProfileFactKind, type RequesterProfileFactDto } from "@/types/requester";

const FACTS = TASK_REQUEST_COPY.facts;

export function requesterFactMessage(fact: RequesterProfileFactDto): string {
  switch (fact.kind) {
    case RequesterProfileFactKind.MEMBER_OF_UNIT:
      return fact.parent ? FACTS.memberOfUnder(fact.unit.name, fact.parent.name) : FACTS.memberOf(fact.unit.name);
    case RequesterProfileFactKind.HOLDS_DESIGNATION:
      return fact.designation ? FACTS.holds(fact.designation.title, fact.unit.name) : FACTS.memberOf(fact.unit.name);
    default: {
      const unreachable: never = fact.kind;
      return unreachable;
    }
  }
}
