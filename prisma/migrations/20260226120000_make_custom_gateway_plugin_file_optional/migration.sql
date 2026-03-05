-- AlterTable: make plugin_file nullable (gateway is created with name+secret only; plugin registers later via SDK)
ALTER TABLE "plugin_webhooks" ALTER COLUMN "plugin_file" DROP NOT NULL;
