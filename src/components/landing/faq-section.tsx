import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqItems = [
  {
    question: 'What is 2Bot?',
    answer:
      '2Bot is a B2B SaaS platform for building workflow automations and backend processes without code. You connect messaging APIs (like Telegram), add AI-powered steps, install plugins from the marketplace, and deploy — all from a visual builder.',
  },
  {
    question: 'Do I need coding experience to use 2Bot?',
    answer:
      'No. 2Bot is designed as a no-code platform. You build workflows by adding visual steps — messages, AI processing, API calls, delays — and configure them through forms. Developers can extend functionality with custom plugins if needed.',
  },
  {
    question: 'What are API credits and how do they work?',
    answer:
      'API credits are the usage currency in 2Bot. Each plan includes a monthly credit allocation. Credits are consumed when your workflows execute AI steps, make external API calls, or process messages through gateways. The Free plan includes 100 credits/month, and paid plans scale up from there.',
  },
  {
    question: 'Which messaging platforms does 2Bot support?',
    answer:
      'Currently 2Bot supports Telegram as the primary gateway. Each bot connects to a Telegram Bot API token. Support for additional platforms is on the roadmap and can be extended through the plugin system.',
  },
  {
    question: 'What AI models can I use in workflows?',
    answer:
      '2Bot supports multiple AI providers including OpenAI (GPT-4, GPT-3.5), Anthropic (Claude), Google (Gemini), and others through configurable AI steps. You can use AI for intent classification, text generation, summarization, and more within your workflows.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes. The Free plan includes 3 workflows, 1 gateway, 100 API credits per month, and access to the plugin marketplace. No credit card is required to sign up. You can upgrade anytime as your needs grow.',
  },
  {
    question: 'How does the plugin marketplace work?',
    answer:
      'The marketplace is a catalog of pre-built plugins you can install into your bots with one click. Plugins add features like analytics tracking, auto-moderation, scheduled messages, and custom integrations. You can also build and publish your own plugins.',
  },
  {
    question: 'Who is behind 2Bot?',
    answer:
      '2Bot is built and maintained by ABC Legacy LLC, a US-based software company. The platform is founded by Alonur Komilov, a full-stack engineer focused on developer tools and workflow automation.',
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-purple-400">
            FAQ
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Frequently asked questions
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Everything you need to know about 2Bot and how it works.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-foreground">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
