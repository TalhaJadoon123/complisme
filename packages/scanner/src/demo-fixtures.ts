/**
 * A deliberately non-compliant sample codebase used by the scanner tests and
 * by `complisme scan --demo`. Every file contains realistic problems.
 */

export interface DemoFile {
  path: string;
  language: 'typescript' | 'python' | 'go';
  content: string;
}

export const DEMO_FILES: DemoFile[] = [
  {
    path: 'src/api/signup.ts',
    language: 'typescript',
    content: `import { prisma } from '../db';
import { logger } from '../log';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function signup(input: SignupInput) {
  const record = await prisma.user.create({
    data: {
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      address: input.address,
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      ip_address: input.ip,
    },
  });

  logger.info('user signed up', { user: record, email: record.email });

  const recommendation = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: \`Score this applicant: \${input.firstName} \${input.lastName}, \${input.email}, born \${input.dateOfBirth}\` }],
  });

  return { record, recommendation: recommendation.choices[0].message.content };
}

export function scoreApplicant(user) {
  const credit_score = user.income > 50000 ? 'high' : 'low';
  return { credit_score, risk_score: Math.random() };
}
`,
  },
  {
    path: 'src/api/support.ts',
    language: 'typescript',
    content: `import OpenAI from 'openai';
import { log } from '../logger';
import { db } from '../db';

const client = new OpenAI();

export async function answerTicket(ticket) {
  const embedding = await client.embeddings.create({
    input: ticket.message,
  });

  console.log('ticket payload', ticket, ticket.customer_email, ticket.customer_id);

  const reply = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: ticket.message }],
  });

  await db.insert('tickets', { ...ticket, embedding: embedding.data[0].embedding });
  log.warn(reply);
  return reply;
}

export function initTracking() {
  window.gtag('config', 'G-XXXXXXX');
  window.fbq('init', '123456');
}
`,
  },
  {
    path: 'src/health/records.py',
    language: 'python',
    content: `import requests
import logging

logger = logging.getLogger(__name__)

API_KEY = "sk-live-9f2b8c1d4e7a6f3b5c2d1e8a9f4b7c3d"

def store_medical_record(patient):
    payload = {
        "patient_id": patient.id,
        "diagnosis": patient.diagnosis,
        "health_data": patient.record,
        "biometric_fingerprint": patient.fingerprint,
        "email": patient.email,
    }
    logger.info(f"processing medical record for {patient.name} with diagnosis {patient.diagnosis}")
    requests.post("https://api.stripe.com/v1/charges", json=payload)
    return payload

def delete_patient(id):
    pass
`,
  },
  {
    path: 'internal/pipeline/main.go',
    language: 'go',
    content: `package main

import (
	"fmt"
	"net/http"
	"os"
)

type Customer struct {
	Email  string
	Name   string
	Salary float64
	Gender string
}

func ProcessCustomer(c Customer) {
	fmt.Printf("processing customer %+v\\n", c)
	fmt.Println("email:", c.Email, "salary:", c.Salary)

	client := &http.Client{}
	resp, err := client.Post("https://api.openai.com/v1/chat/completions", "application/json", nil)
	if err != nil {
		log.Println("error", err)
	}
	defer resp.Body.Close()
}

func main() {
	// Deliberately not a real token shape: GitHub secret scanning flags any
	// string matching ghp_ + 36 chars, and a scanner fixture must not teach
	// people to paste real credentials into source.
	token := "REDACTED-example-token-not-a-credential"
	os.Setenv("GITHUB_TOKEN", token)
	ProcessCustomer(Customer{Email: "a@b.com", Name: "A B", Salary: 50000, Gender: "female"})
}
`,
  },
];

export const DEMO_GOOD_FILE: DemoFile = {
  path: 'src/compliant/checkout.ts',
  language: 'typescript',
  content: `import { prisma } from '../db';
import { hasConsent } from '../consent';

// Documented lawful basis, retention and consent gate on every personal data path.
const RETENTION_DAYS = 365;

export async function checkout(userId: string, items: unknown[]) {
  if (!(await hasConsent(userId, 'marketing'))) {
    throw new Error('consent required');
  }
  const order = await prisma.order.create({
    data: { userId, items, expiresAt: new Date(Date.now() + RETENTION_DAYS * 86400000) },
  });
  return order;
}
`,
};