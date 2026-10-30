import type { Knex } from "knex";

// Curated background on the state of each topic (wars, negotiations, pending
// deadlines), injected into the classifier and selection prompts so the model
// can judge whether a post is news. Append-only: every save is a new version,
// so the latest row per topic is the live brief and older rows are the audit
// trail. Written manually (pasted, or generated on demand) -- never on a
// schedule.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("world_briefs", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .text("topic")
            .notNullable()
            .references("topic")
            .inTable("topic_market_map")
            .onDelete("CASCADE")
            .withKeyName("fk_world_briefs_topic_market_map");
        table.text("body").notNullable();
        table.text("source").notNullable();
        table.timestamp("as_of", { useTz: true }).notNullable();
        table.jsonb("source_urls").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw("CREATE INDEX idx_world_briefs_topic_as_of ON world_briefs (topic, as_of DESC, created_at DESC)");
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("world_briefs");
}
