# Archive

These documents record how v1 was planned and built, in seven phases between October and November 2026. They are kept as history and are no longer updated, so the code and the current docs take precedence wherever they disagree.

| File                                             | What it was                                                                                   | Where its content lives now                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [implementation-plan.md](implementation-plan.md) | The v1 plan: scope, decisions, data model, core logic, build phases, risks                    | [architecture.md](../architecture.md)                                         |
| [PROGRESS.md](PROGRESS.md)                       | Per-phase status: tasks, what was verified, bugs found, decisions and next steps              | [decisions.md](../decisions.md)                                               |
| [setup.md](setup.md)                             | Local setup, hosted setup for the original deployment, and a manual exit check for each phase | [development.md](../development.md) and [self-hosting.md](../self-hosting.md) |

Some details here are out of date. For example, the plan says Cloudflare Pages where the app actually deploys as a Worker, lists three library sorts where there are now five, and describes a private repo with no license.
