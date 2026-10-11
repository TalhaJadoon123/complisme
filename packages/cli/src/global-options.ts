/** Options accepted by every command, declared once so commands can share them. */

export interface GlobalOptions {
  dir?: string;
  global?: boolean;
  json?: boolean;
  yes?: boolean;
  profile?: string;
}