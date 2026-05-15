package sources

// Curated company lists per ATS provider. ATS providers don't expose a public
// "list all boards" endpoint, so this is hand-maintained. Slugs may drift -
// 404s during fetch are logged and skipped, not fatal. Override with the
// {ATS}_COMPANIES env vars (CSV).
//
// Goal here is breadth, not perfection. We include any plausible candidate
// and let 404s shake out. Counting on the failed-list ratio: ~30-50% is fine.

var DefaultGreenhouse = []string{
	// FAANG-adjacent / big consumer
	"airbnb", "stripe", "anthropic", "discord", "cloudflare", "figma",
	"notion", "robinhood", "instacart", "doordash", "lyft", "snowflake",
	"datadog", "elastic", "reddit", "squarespace", "shopify", "twitch",
	"github", "gitlab", "hashicorp", "mongodb", "dropbox", "etsy",
	"pinterest", "mozilla", "sentry", "twilio", "intercom", "asana",
	"slack", "atlassian", "lattice", "samsara", "gusto", "vimeo",
	"quora", "zoom", "hubspot", "duolingo", "coursera", "snapinc",
	"hopper", "opendoor", "redfin", "zillow", "expedia", "wayfair",
	"thumbtack", "yelp", "groupon", "medium", "patreon",
	// Fintech
	"brex", "chime", "betterment", "wealthfront", "navan", "ramp",
	"plaidinc", "earnin", "blockchain", "blockchaincom", "circle",
	"affirm", "klarna", "block", "squareinc", "robinhoodmarkets",
	"fanduel", "draftkings", "betterup",
	// AI / ML / data
	"openai", "scale", "scaleai", "runwayml", "replit", "anduril",
	"perplexityai", "perplexity", "characterai", "weaviate", "pinecone",
	"writer", "cohereai",
	"databricks", "snowflakecomputing", "planetscale", "cockroachdb",
	"redis", "confluent", "datastax", "neon", "vercel", "netlify",
	"hcompany", "nebius",
	// Gaming / media
	"riotgames", "ea", "niantic", "roblox", "unity", "epicgames",
	"peloton", "robloxcorp",
	// Health / commerce / consumer
	"sweetgreen", "hims", "oscar", "glassdoor", "hinge", "bumble",
	"warbyparker", "wayfair", "rover", "stitchfix", "thirdlove",
	"goodrx", "rohealth", "noomhealth", "noom", "calmcom", "calm",
	"headspace", "lyrahealth",
	// Marketplaces / B2B / startups
	"faire", "rippling", "deel", "gusto", "trello", "miro",
	"webflow", "canva", "bento", "front", "frontapp", "intercomengineering",
	"clay", "attio", "linear", "pitch", "loom",
	"lattice", "docebo", "cultureamp", "personio",
	// More tech
	"twitter", "twittercom", "x-corp", "snap", "snapchat", "pinterest",
	"yelp", "tripadvisor", "booking", "gopuff", "shipt", "uber",
	"uberresearch", "lyftengineering", "doordashinc",
	// Various
	"tinder", "match", "okcupid", "matchgroup", "bumbleinc",
	"instabase", "openphone", "modern", "modernhealth",
	"newrelic", "fastly", "akamai",
	"mongodbinc", "couchbase", "neo4j", "elasticsearch",
	// Older but solid
	"strava", "vimeoinc", "letterboxd", "discordinc",
	"opensea", "superhuman", "rivian", "lucidmotors",
	"rakuten", "rakutenusa",
	// Recently raised AI startups
	"sakana", "blackforestlabs", "physicalintelligence",
	"mistralai", "groq", "lambdalabs", "lambda",
	"inflection", "you", "abridge", "tome", "tomeapp",
	// Crypto / web3
	"chainalysis", "fireblocks", "coinbase", "coinbasecloud",
	// Misc
	"audaxhealth", "discord-inc", "cardless", "stordcom",
	"glean", "harvey", "anthropicai",

	// Canada expansion 2026-05-12. Canadian tech companies on Greenhouse.
	"coveo",           // Quebec - enterprise search
	"d2l",             // Kitchener-Waterloo - Brightspace LMS
	"klue",            // Vancouver - competitive intelligence
	"vidyard",         // Kitchener-Waterloo - video for sales
	"tophat",          // Toronto - edtech
	"applyboard",      // Kitchener-Waterloo - study abroad
	"league",          // Toronto - health benefits platform
	"ada",             // Toronto - support automation
	"benevity",        // Calgary - corporate giving
	"jobber",          // Edmonton - home-services SaaS
	"thinkific",       // Vancouver - online courses
	"clio",            // Vancouver - legal practice software
	"hopper",          // Montreal - travel (note: also already listed above)
	"ritualco",        // Toronto - food ordering

	// Canada expansion 2026-05-15 (round 2). More Canadian tech believed
	// to host a Greenhouse board. Speculative; 404s log+skip per the file-
	// header contract.
	"plooto",          // Toronto - B2B payments
	"borrowell",       // Toronto - consumer credit / loans
	"drop",            // Toronto - rewards
	"vendasta",        // Saskatoon - SaaS for SMB resellers
	"north",           // Waterloo - smart-glass startup (alt slug)
	"wave",            // Toronto - small-business accounting
	"waveapps",        // alt slug
	"sonderinc",       // Montreal - hospitality
	"properly",        // Toronto - prop-tech
	"goeasy",          // Toronto - consumer finance
	"finn-ai",         // Vancouver - banking conversational AI
	"trulioo",         // Vancouver - identity verification
	"snaplii",         // Toronto - prepaid card / loyalty
	"flipp",           // Toronto - retail tech
	"viafouracrowdriff", // Toronto - UGC discovery
	"crowdriff",       // Toronto - alt slug
	"axonify",         // Waterloo - employee training
	"clutch-card",     // alt for Clutch
	"magnetforensics", // Waterloo - digital forensics
	"vena",            // Toronto - financial planning
	"copperleaf",      // Vancouver - asset planning
	"dapperlabs",      // Vancouver - NFTs / Flow blockchain
	"alidagroup",      // Toronto - CX management (was Vision Critical)
	"flinks",          // Montreal - open banking
	"rewindio",        // Ottawa - SaaS backup
	"acuityads",       // Toronto - programmatic advertising
	"ssense",          // Montreal - fashion ecommerce
	"unbounce",        // Vancouver - landing page builder
	"sliceapp",        // alt slug
	"slice",           // Toronto - mobile commerce
	"appsmith",        // Vancouver - low-code (Canadian HQ?)
	"benchaccounting", // Vancouver - SMB bookkeeping
	"clutchcanada",    // alt slug

	// auto-discovered 2026-05-07 (98)
	"10xgenomics",
	"adaptivebiotechnologies",
	"airtable",
	"algolia",
	"allbirds",
	"alloy",
	"amplitude",
	"anaplan",
	"apollo",
	"atomwise",
	"attentive",
	"billcom",
	"bombas",
	"cameo",
	"carta",
	"celonis",
	"chargepoint",
	"clickhouse",
	"coursehero",
	"cresta",
	"current",
	"cybereason",
	"dashlane",
	"devrev",
	"doctolib",
	"druva",
	"fivetran",
	"flatironhealth",
	"flexport",
	"forward",
	"gemini",
	"geniussports",
	"getyourguide",
	"ghost",
	"ginkgobioworks",
	"glossier",
	"grafanalabs",
	"groww",
	"hellofresh",
	"helsing",
	"hightouch",
	"honeycomb",
	"inflectionai",
	"justworks",
	"khanacademy",
	"klaviyo",
	"lastpass",
	"lithic",
	"magic",
	"marqeta",
	"masterclass",
	"materialize",
	"mavenclinic",
	"mercury",
	"mirakl",
	"mixpanel",
	"monzo",
	"myfitnesspal",
	"n26",
	"novacredit",
	"okta",
	"onemedical",
	"orcasecurity",
	"oura",
	"outrider",
	"pagerduty",
	"parloa",
	"phonepe",
	"pleo",
	"postman",
	"postscript",
	"project44",
	"recursionpharmaceuticals",
	"relaytherapeutics",
	"remotecom",
	"runpod",
	"salsify",
	"schrdinger",
	"sofi",
	"stabilityai",
	"startree",
	"stockx",
	"strivehealth",
	"sumologic",
	"taketwo",
	"toast",
	"togetherai",
	"traderepublic",
	"tripactions",
	"truework",
	"twistbioscience",
	"udacity",
	"udemy",
	"warp",
	"waymo",
	"xai",
	"yotpo",
	"zymergen",

	// auto-discovered 2026-05-13 (11)
	"cleo",
	"hootsuite",
	"mejuri",
	"metro",
	"ritual",
	"rumble",
	"skupos",
	"touchbistro",
	"tucows",
	"universityoftoronto",
	"workleap",

	// Big-tech + known-startup expansion 2026-05-14. Companies known or
	// strongly suspected to host a Greenhouse board, biased toward names
	// hiring at scale right now. 30-50% of speculative slugs 404 and
	// shake out cleanly in the next run; that's the documented trade-off.
	// AI infra / model labs
	"weightsandbiases", "wandb", "sambanovasystems", "sambanova",
	"cerebrassystems", "cerebras", "tenstorrent", "etched", "dmatrix",
	"crusoeenergy", "crusoe", "coreweave", "paperspace",
	"snorkelai", "dataiku", "dominodatalab",
	"arizeai", "arize", "fiddlerai", "robustintelligence",
	"modularinc", "modular", "tecton", "feastfeatures",
	// AI applications
	"sierraai", "hippocraticai", "fixieai", "vapiai",
	"dusttt", "dust", "langchainai", "langchain", "langfuse",
	"braintrustdata", "braintrust", "observableinc", "observable",
	"glean", "harveyai", "abridgeai",
	// Vector / data infra
	"qdrantcloud", "zillizinc", "zilliz", "chromacore", "chroma",
	"motherduckinc", "motherduck", "tinybird", "tinybirdco",
	"redpandadata", "redpanda", "materializeinc",
	// Dev tools / cloud
	"turso", "fly", "supabaseinc", "vercelinc",
	"sentryio", "datadoghq", "snyk", "lokalise",
	"github-jobs", "gitlab-jobs", "gitea", "codecovinc", "codecov",
	"planetscaledatabase", "planetscaledb",
	// Robotics / autonomous
	"cruise", "plusai", "plus", "embarktrucks", "kodiakrobotics",
	"nuro", "appliedintuition", "wayve", "wayveai", "skyryse",
	// Defense / aerospace
	"shieldai", "saronicofficial", "saronic", "anduril-industries",
	"hadrianautomation", "hadrian",
	// Fintech / consumer
	"nubank", "mercadolibre", "rappicareers", "airwallex",
	"klarnacareers", "wisecareers", "novocredit",
	"bilttechnologies", "bilt", "klover", "bridgeio",
	// Consumer / media
	"bytedance", "tiktok", "tiktokcareers", "discord-careers",
	"epicgamesinc", "rokuinc",
	// Productivity / B2B SaaS
	"airtableinc", "asana-careers", "miroinc", "lokalisehq",
	"clickup", "monday", "mondaycom",
	// Enterprise / observability
	"observe", "cribl", "honeycombio", "lightstephq", "signoz",
	// Healthcare
	"includedhealth", "transcarent", "memora-health", "memorahealth",
}

var DefaultLever = []string{
	"netflix", "spotify", "ramp", "scale", "cohere", "plaid", "brex",
	"gusto", "asana", "benchling", "clari", "latch", "eventbrite",
	"box", "segment", "huggingface", "stabilityai", "writer", "adept",
	"you", "deepgram", "fireworks", "runpod", "modal-labs", "togetherai",
	"kraken", "ledger", "alchemy", "thirdweb", "circle",
	"public", "carta", "marqeta", "alloy", "modernhealth", "rover",
	"classpass", "gympass", "podium",
	"talkdesk", "drift", "branch", "voiceflow", "lago",
	"sanity", "contentful", "frontapp", "front",
	"faire", "wisetack", "capchase", "karat",
	"gem", "checkr", "showpad", "amplitude",
	"mixpanel", "fivetran", "hex", "looker",
	"automattic", "buffer", "zapier", "remote", "deel",
	// Larger / European
	"netflix-engineering", "spotifyjobs",
	"ramphq", "rampnetwork",
	"masterclass", "udemy", "moveable",
	"yelp-engineering", "boxhq",
	"cohereai", "cohere-jobs",
	"plaidcareers",
	// Crypto
	"opensea", "magiceden", "matter-labs", "matterlabs",
	"polygon", "polygonzk", "uniswap",
	// Health
	"ohayuhealth", "tempushealth", "tempus", "verily",
	"flatironhealth", "flatiron",
	"hims-and-hers",
	// Misc
	"figma-engineering", "applovin",
	"applovin-jobs", "discord-jobs",
	"sentryio",
	"dailyweb",

	// Canada expansion 2026-05-12. Canadian tech companies on Lever.
	"hootsuite",       // Vancouver
	"touchbistro",     // Toronto - restaurant POS
	"trulioo",         // Vancouver - identity verification
	"klipfolio",       // Ottawa - dashboards
	"vidyard",         // Kitchener-Waterloo (also tried on Greenhouse)
	"d2l-jobs",        // alt slug for D2L
	"waveapps",        // Toronto - accounting (acquired by H&R Block)
	"snapcommerce",    // Toronto - commerce

	// Canada expansion 2026-05-15 (round 2). More CA companies that likely
	// run a Lever board; speculative slugs, 404s log+skip.
	"lightspeed",      // Montreal - retail POS (now lightspeedhq?)
	"lightspeedhq",    // alt slug
	"nuvei",           // Montreal - payments
	"unbounce",        // Vancouver - landing pages
	"freshbooks",      // Toronto - SMB accounting
	"loopio",          // Toronto - RFP response automation
	"jobillico",       // Quebec - job board (yes really)
	"workleap",        // Montreal - HR / engagement
	"chatdesk",        // Toronto - customer service
	"dialpadinc",      // Vancouver office is huge
	"figment",         // Toronto - blockchain staking
	"axiom-zen",       // Vancouver - Dapper Labs parent
	"perimeter81",     // Vancouver office
	"buildersbox",     // alt slug
	"clearbanc",       // Toronto - ecommerce financing
	"clearco",         // alt slug for Clearbanc
	"finto",           // Vancouver
	"propelhr",        // Vancouver
	"unhaggle",        // Toronto - auto retail tech

	// auto-discovered 2026-05-07 (43)
	"acceldata",
	"aircall",
	"anchorage",
	"anyscale",
	"atlassian",
	"attentive",
	"brilliant",
	"carbonhealth",
	"contentsquare",
	"coupa",
	"cred",
	"educative",
	"freshworks",
	"fundrise",
	"gopuff",
	"lifeforce",
	"lyrahealth",
	"medium",
	"meesho",
	"mistral",
	"neon",
	"palantir",
	"paytm",
	"pennylane",
	"pushsecurity",
	"qonto",
	"ro",
	"skillshare",
	"spendesk",
	"swile",
	"synthego",
	"sysdig",
	"trinet",
	"veepee",
	"veeva",
	"velocityglobal",
	"vestiairecollective",
	"voltus",
	"wealthfront",
	"wealthsimple",
	"whoop",
	"workos",
	"zoox",

	// auto-discovered 2026-05-13 (5)
	"achievers",
	"pointclickcare",
	"snowplow",
	"tealbook",
	"wattpad",

	// Big-tech + known-startup expansion 2026-05-14. Lever is heavy with
	// modern early-/mid-stage tech; this batch leans into model labs,
	// devtools, and AI-product startups currently hiring.
	"characterai", "character", "characterdotai",
	"flyio", "supabasecareers",
	"typeform-co", "typeform",
	"pocketworlds", "pocketworldsinc",
	"groqcareers", "groqinc",
	"rivosinc", "rivos",
	"tenstorrent-jobs",
	"snowflakecareers",
	"hexdotcom", "hex-tech",
	"ai21labs",
	"poolside-ai", "poolside",
	"sierraai-careers",
	"distyl", "distylai",
	"figureai", "figure",
	"midjourney",
	"sakanaai", "blackforestlabs-careers",
	"suno", "sunoai",
	"perplexity-careers",
	"vapi-ai", "vapi",
	"e2bdev", "e2b",
	"replicate-careers",
}

var DefaultAshby = []string{
	"linear", "vercel", "vanta", "mercury", "posthog", "retool",
	"render", "supabase", "warp", "cursor", "hex", "modal",
	"replicate", "browserbase", "knock", "productlane", "neon",
	"baseten", "anyscale",
	"elevenlabs", "mintlify", "perplexity", "ai21labs",
	"contextualai",
	"runwayml", "characterai", "magic", "magicdev",
	"openinterpreter", "codeium", "tabnine", "continue",
	"jasper", "regie", "harvey",
	"jupiterone", "drata", "secureframe",
	"clay", "attio", "primer",
	"browserstack", "raycast", "linear-app",
	"prismaio", "prisma", "sourcegraph",
	"cresta", "rilla", "manychat", "decagon",
	"zedindustries", "zed",
	"speakeasyapi", "speakeasy",
	// Crypto / web3
	"figmentcrypto", "alchemyplatform",
	// Misc
	"hightouch", "census",
	"airbyte", "dbt-labs", "dbtlabs", "dagsterlabs",
	"prefect", "metaplane",
	// Newer
	"openai-startup",
	"lambda-labs",
	"glean-jobs",
	"poolside",
	"aritmiehealth",
	"luma", "lumalabs",
	"hyperliquid", "monad",
	"granolaai",
	"clerk", "clerkdev",
	"workos",
	"trigger", "triggerdev",
	"resend",
	"liveblocks",
	"livekit",
	"convex", "convexdev",
	"upstash", "tigris",
	"highlight",
	"getfeatherbase",
	"granola",
	"fly", "flyio",
	"warp-dev",
	"causal",
	"merge-api",
	"hex-tech",
	"pylon",
	"tessl",
	"motherduck",
	"runme",
	"mendable",

	// auto-discovered 2026-05-07 (102)
	"1password",
	"abridge",
	"acorns",
	"affirm",
	"airtable",
	"alan",
	"alchemy",
	"amplitude",
	"ankorstore",
	"atlan",
	"away",
	"backmarket",
	"bolt",
	"carbonhealth",
	"cityblock",
	"clickup",
	"cluely",
	"cohere",
	"color-health",
	"compound",
	"confluent",
	"dapper",
	"deel",
	"deepl",
	"deepnote",
	"doctolib",
	"doppler",
	"dune",
	"eightsleep",
	"ghost",
	"gorgias",
	"helius",
	"influxdata",
	"inngest",
	"insitro",
	"kraken",
	"lago",
	"lambda",
	"langchain",
	"ledger",
	"lindy",
	"llamaindex",
	"loom",
	"lyrahealth",
	"magiceden",
	"marqeta",
	"materialize",
	"materialsecurity",
	"mem",
	"mercor",
	"mistral",
	"moderntreasury",
	"mural",
	"mux",
	"niantic",
	"notion",
	"openai",
	"opensea",
	"outset",
	"owkin",
	"oyster",
	"patreon",
	"pennylane",
	"persona",
	"photoroom",
	"pika",
	"pinecone",
	"plaid",
	"pleo",
	"pliant",
	"project44",
	"prometheus",
	"quicknode",
	"railway",
	"ramp",
	"reddit",
	"replit",
	"runway-ml",
	"scaler",
	"sentilink",
	"sentry",
	"sierra",
	"skymavis",
	"snyk",
	"sorare",
	"span",
	"spendesk",
	"strava",
	"stytch",
	"substack",
	"tigerdata",
	"tripactions",
	"trm-labs",
	"uniswap",
	"unit",
	"vivun",
	"wealthsimple",
	"weaviate",
	"whatnot",
	"whoop",
	"wiz",
	"writer",

	// auto-discovered 2026-05-13 (18)
	"benevity",
	"float",
	"hatch",
	"hopper",
	"jobber",
	"kindred",
	"klue",
	"koho",
	"levels",
	"loopio",
	"maple",
	"procurify",
	"rewind",
	"snowflake",
	"stream",
	"thinkific",
	"top-hat",
	"trulioo",

	// Big-tech + known-startup expansion 2026-05-14. Ashby skews modern
	// AI/dev-tool startups; this batch fills gaps in that segment.
	"e2b", "e2b-dev", "e2bdev",
	"crewai", "crew-ai",
	"autogen", "autogenai",
	"mem", "mem-ai",
	"speak", "speak-ai", "speakai",
	"numeric", "numericinc",
	"distyl-ai", "distyl",
	"granolaai-careers",
	"perplexity-ai",
	"figure-ai", "figureai",
	"midjourney-careers",
	"sakana-ai", "sakana",
	"black-forest-labs",
	"suno-ai", "suno",
	"poolside-careers",
	"pikaai", "pika",
	"hyperliquid-careers",
	"convex-dev",
	"trigger-dev",
	"resend-com",
	"vercel-careers",
	"replicate-ai",
	"modal-careers",
	"baseten-careers",
	"runwayml-careers",
	"adept-careers",
	"fireworks-careers",
	"together-ai", "togetheraicareers",
	"lumen-orbit", "lumenorbit",
	"physical-intelligence", "physicalintelligence-careers",
	"writeralpha", "writerinc",
	"cresta-careers",
	"sierra-ai",
	"abridge-careers",
	"hippocratic-ai",
	"tessl",
	"superhuman-careers",
	"linear-careers",
	"raycast-app", "raycast-careers",
	"warp-terminal",
	"zed-industries",
	"motherduck-careers",
	"liveblocks-careers",
	"livekit-careers",
	"posthog-careers",
	"vanta-careers",
	"granolaai",
}

var DefaultSmartRecruiters = []string{
	// Large enterprises commonly on SmartRecruiters
	"visa", "allianz", "bosch", "ubisoft", "roche", "equinix",
	"ikea", "lvmh", "hertz", "hilton", "marriott", "accor",
	"lululemon", "schaeffler", "nestle", "unilever",
	"pepsico", "schneider-electric", "schneiderelectric",
	"hitachi", "deutschebahn",
	"sap", "siemens", "boeing",
	"ringcentral", "ringcentralinc",
	"twentyfourseven", "publicismedia", "publicis",
	"servicenow",
	"square", "spotifyjobs",
	"capgemini",
	"atos",
	"bayer",
	"basf",
	"merck",
	"abinbev",
	"imperial",
	"pwc",
	"deloitte",
	"accenture",
	"ey", "kpmg",
	"adidas", "nike",
	"sephora",
	"kering", "richemont",
	"loreal",
	"johnson",
	"bookingcom", "booking",
	"foodpanda",
	"deliveryhero",
	"justeat",
	"deliveroo",
	"glovo",
	"dorling",
	"stryker",
	"pfizer",

	// auto-discovered 2026-05-07 (16)
	"bigcommerce",
	"dailymotion",
	"devotedhealth",
	"forward",
	"freshworks",
	"glean",
	"justworks",
	"m1finance",
	"newrelic",
	"palantir",
	"sageintacct",
	"sportradar",
	"uber",
	"wayfair",
	"whatfix",
	"wise",

	// auto-discovered 2026-05-13 (6)
	"couche-tard",
	"hootsuite",
	"ibigroup",
	"loophealth",
	"torstar",
	"universityhealthnetwork",

	// Big-tech + known-startup expansion 2026-05-14. SmartRecruiters
	// hosts a wide enterprise tail; this batch adds known major hirers.
	"shopify", "shopifycareers",
	"square-careers",
	"stripe-careers",
	"ubercareers",
	"airbnb-careers",
	"twitch-careers",
	"netflix-careers",
	"pinterest-careers",
	"snap-careers",
	"redditcareers",
	"linkedinjobs", "linkedincareers",
	"deutschetelekom",
	"telefonica",
	"vodafone",
	"orangejobs",
	"axa", "axainsurance",
	"michelin",
	"renault",
	"airbusjobs", "airbus",
	"daimler", "mercedesbenz",
	"bmwgroup",
	"vw", "volkswagen",
	"siemens-energy",
}

var DefaultWorkable = []string{
	// Mid-market companies known/likely to use Workable
	"transferwise", "wise",
	"payoneer",
	"qonto",
	"alan",
	"swile",
	"spendesk",
	"papaya",
	"papayaglobal",
	"bigpanda",
	"cybereason",
	"mendix",
	"gympass",
	"deliveroo",
	"klarna",
	"revolut",
	"monzo",
	"n26",
	"trade-republic",
	"traderepublic",
	"frichti",
	"sunday",
	"miro",
	"ableton",
	"soundcloud",
	"hopin",
	"rappi",
	"factorialhr",
	"factorial",
	"glovo",
	"contentsquare",
	"contentsq",
	"agora",
	"sumup",
	"klarna-careers",
	"thoughtmachine",
	"thought-machine",
	"snyk",
	"checkout",
	"checkoutcom",
	"signaturit",
	"finn",
	"finn-auto",

	// Big-tech + known-startup expansion 2026-05-14. Workable skews
	// European mid-market and SMB; this batch covers known hirers.
	"backbase",
	"infermedica",
	"ataccama",
	"datadiver",
	"qonto-careers",
	"swilecareers",
	"alan-careers",
	"frichti-jobs",
	"glovoapp",
	"trade-republic-jobs",
	"deliveroo-careers",
	"klarna-jobs",
	"revolut-careers",
}

// Workday tenants. Each entry is a (display, tenant, region, site) tuple
// because all four are required to construct the public CXS API URL. Workday
// does not have a "list all tenants" endpoint and customer provisioning region
// (wd1/wd5/wd103/...) is not derivable from the tenant name. Mappings
// hand-curated; bad combinations 404 cleanly and are skipped.
//
// Pattern verification: open `https://{tenant}.{region}.myworkdayjobs.com/{site}`
// in a browser - if jobs load, the tuple is correct. The site-path can usually
// be read from the URL after a click on "View All Jobs" on the company's
// careers page.
var DefaultWorkday = []WorkdayCompany{
	// Tech / enterprise
	{Display: "NVIDIA",          Tenant: "nvidia",       Region: "wd5",  Site: "NVIDIAExternalCareerSite"},
	{Display: "Salesforce",      Tenant: "salesforce",   Region: "wd12", Site: "External_Career_Site"},
	{Display: "ServiceNow",      Tenant: "servicenow",   Region: "wd1",  Site: "External_Career_Site"},
	{Display: "Cisco",           Tenant: "cisco",        Region: "wd5",  Site: "External_Career_Site_XJB"},
	{Display: "Adobe",           Tenant: "adobe",        Region: "wd5",  Site: "external_experienced"},
	{Display: "VMware",          Tenant: "vmware",       Region: "wd1",  Site: "VMware"},
	{Display: "Workday",         Tenant: "workday",      Region: "wd5",  Site: "Workday"},
	{Display: "Intuit",          Tenant: "intuit",       Region: "wd12", Site: "External"},
	{Display: "Atlassian",       Tenant: "atlassian",    Region: "wd5",  Site: "External"},
	{Display: "Autodesk",        Tenant: "autodesk",     Region: "wd1",  Site: "Ext"},
	{Display: "Dell Technologies", Tenant: "delltechnologies", Region: "wd1", Site: "External"},
	{Display: "HPE",             Tenant: "hpe",          Region: "wd5",  Site: "Jobsathpe"},
	{Display: "HP",              Tenant: "hp",           Region: "wd5",  Site: "ExternalCareerSite"},
	{Display: "AMD",             Tenant: "amd",          Region: "wd1",  Site: "External"},
	{Display: "Broadcom",        Tenant: "broadcom",     Region: "wd1",  Site: "External_Career_Site_New"},
	{Display: "Intel",           Tenant: "intel",        Region: "wd1",  Site: "External"},
	{Display: "Micron",          Tenant: "micron",       Region: "wd1",  Site: "External"},
	{Display: "Qualcomm",        Tenant: "qualcomm",     Region: "wd5",  Site: "External"},
	{Display: "Texas Instruments", Tenant: "ti",         Region: "wd1",  Site: "External"},
	{Display: "Western Digital", Tenant: "westerndigital", Region: "wd1", Site: "External"},
	{Display: "NetApp",          Tenant: "netapp",       Region: "wd1",  Site: "NetApp"},
	{Display: "Pure Storage",    Tenant: "purestorage",  Region: "wd1",  Site: "Pure_Storage_Career_Site"},
	{Display: "Palo Alto Networks", Tenant: "paloaltonetworks", Region: "wd5", Site: "PaloAltoNetworks"},

	// Financial services
	{Display: "JPMorgan Chase",  Tenant: "jpmc",         Region: "wd1",  Site: "jpmc"},
	{Display: "Goldman Sachs",   Tenant: "goldmansachs", Region: "wd1",  Site: "goldman"},
	{Display: "Morgan Stanley",  Tenant: "morganstanley", Region: "wd5", Site: "External"},
	{Display: "Citi",            Tenant: "citi",         Region: "wd5",  Site: "2"},
	{Display: "Capital One",     Tenant: "capitalone",   Region: "wd12", Site: "Capital_One"},
	{Display: "American Express", Tenant: "aexp",        Region: "wd1",  Site: "AmericanExpress"},
	{Display: "Wells Fargo",     Tenant: "wd5",          Region: "wd5",  Site: "WellsFargoJobs"},
	{Display: "Charles Schwab",  Tenant: "schwab",       Region: "wd1",  Site: "Schwab"},
	{Display: "Mastercard",      Tenant: "mastercard",   Region: "wd1",  Site: "CorporateCareers"},
	{Display: "Visa",            Tenant: "visa",         Region: "wd1",  Site: "External"},
	{Display: "BlackRock",       Tenant: "blackrock",    Region: "wd1",  Site: "BlackRock"},
	{Display: "Fidelity",        Tenant: "fmr",          Region: "wd1",  Site: "external"},
	{Display: "Bank of America", Tenant: "bankofamerica", Region: "wd1", Site: "BofAJobs"},
	{Display: "PayPal",          Tenant: "paypal",       Region: "wd1",  Site: "jobs"},

	// Healthcare / pharma
	{Display: "UnitedHealth Group", Tenant: "unitedhealthgroup", Region: "wd5", Site: "External"},
	{Display: "CVS Health",      Tenant: "cvshealth",    Region: "wd1",  Site: "CVS_Health_Careers"},
	{Display: "Cigna",           Tenant: "cigna",        Region: "wd5",  Site: "cigna_careers"},
	{Display: "Humana",          Tenant: "humana",       Region: "wd5",  Site: "External"},
	{Display: "Pfizer",          Tenant: "pfizer",       Region: "wd1",  Site: "PfizerCareers"},
	{Display: "Moderna",         Tenant: "moderna",      Region: "wd1",  Site: "External"},
	{Display: "Eli Lilly",       Tenant: "lilly",        Region: "wd5",  Site: "LLY"},

	// Consumer / retail
	{Display: "Walmart",         Tenant: "walmart",      Region: "wd5",  Site: "WalmartExternal"},
	{Display: "Target",          Tenant: "target",       Region: "wd5",  Site: "targetcareers"},
	{Display: "Costco",          Tenant: "costco",       Region: "wd5",  Site: "External"},
	{Display: "Home Depot",      Tenant: "homedepot",    Region: "wd1",  Site: "homedepot"},
	{Display: "Best Buy",        Tenant: "bestbuy",      Region: "wd5",  Site: "External"},
	{Display: "Nike",            Tenant: "nike",         Region: "wd1",  Site: "nike"},
	{Display: "Starbucks",       Tenant: "starbucks",    Region: "wd5",  Site: "External"},

	// Media / entertainment
	{Display: "Disney",          Tenant: "disney",       Region: "wd5",  Site: "disneycareer"},
	{Display: "Comcast",         Tenant: "comcast",      Region: "wd5",  Site: "Comcast_Careers"},
	{Display: "Warner Bros Discovery", Tenant: "wbd",    Region: "wd5",  Site: "Global"},
	{Display: "Sony",            Tenant: "sonypictures", Region: "wd1",  Site: "spe"},

	// Industrial / energy / auto
	{Display: "Ford",            Tenant: "ford",         Region: "wd1",  Site: "FordCareers"},
	{Display: "GM",              Tenant: "gm",           Region: "wd5",  Site: "Careers_External"},
	{Display: "Tesla",           Tenant: "tesla",        Region: "wd1",  Site: "Tesla"}, // sometimes uses other ATS
	{Display: "Boeing",          Tenant: "boeing",       Region: "wd1",  Site: "EXTERNAL_CAREERS"},
	{Display: "Lockheed Martin", Tenant: "lockheedmartin", Region: "wd1", Site: "External"},
	{Display: "Raytheon",        Tenant: "rtx",          Region: "wd5",  Site: "REC_RTX_Ext_Gateway"},
	{Display: "GE",              Tenant: "ge",           Region: "wd5",  Site: "GE_External"},

	// Telecom
	{Display: "AT&T",            Tenant: "att",          Region: "wd1",  Site: "ATTEXTERNAL"},
	{Display: "Verizon",         Tenant: "verizon",      Region: "wd5",  Site: "external"},
	{Display: "T-Mobile",        Tenant: "t-mobile",     Region: "wd1",  Site: "TMobile"},

	// Hospitality
	{Display: "Marriott",        Tenant: "marriott",     Region: "wd5",  Site: "marriott"},
	{Display: "Hilton",          Tenant: "hilton",       Region: "wd5",  Site: "Hilton_Careers"},

	// Tech mid-cap / unicorns on Workday
	{Display: "Zoom",            Tenant: "zoom",         Region: "wd5",  Site: "Zoom"},
	{Display: "Snowflake",       Tenant: "snowflake",    Region: "wd1",  Site: "External"},
	{Display: "Splunk",          Tenant: "splunk",       Region: "wd5",  Site: "external"},
	{Display: "Akamai",          Tenant: "akamaicareers", Region: "wd1", Site: "External"},
	{Display: "F5",              Tenant: "f5",           Region: "wd1",  Site: "F5_Networks_External"},
	{Display: "Juniper Networks", Tenant: "juniper",     Region: "wd5",  Site: "JNetworks"},

	// European / international
	{Display: "Deutsche Bank",   Tenant: "db",           Region: "wd3",  Site: "DBWebsite"},
	{Display: "Barclays",        Tenant: "barclays",     Region: "wd3",  Site: "External"},
	{Display: "HSBC",            Tenant: "hsbc",         Region: "wd3",  Site: "External"},
	{Display: "UBS",             Tenant: "ubs",          Region: "wd3",  Site: "global"},
	{Display: "BNP Paribas",     Tenant: "bnpparibas",   Region: "wd3",  Site: "BNP-PARIBAS-CAREERS"},

	// Hospital networks (Phase 2 - healthcare expansion). Tenants below are
	// publicly documented Workday URLs. The crawler logs+skips on 404, so
	// stale slugs are wasteful but not breaking - verify via the careers
	// page URL pattern `https://{tenant}.{region}.myworkdayjobs.com/{site}`
	// before adding new ones.
	{Display: "HCA Healthcare",          Tenant: "hcahealthcare",     Region: "wd1", Site: "HCA_External"},
	{Display: "Kaiser Permanente",       Tenant: "kp",                Region: "wd5", Site: "External"},
	{Display: "Mass General Brigham",    Tenant: "partners",          Region: "wd5", Site: "Partners"},
	{Display: "AdventHealth",            Tenant: "adventhealth",      Region: "wd1", Site: "External"},
	{Display: "Tenet Healthcare",        Tenant: "tenethealth",       Region: "wd1", Site: "External"},
	{Display: "Northwell Health",        Tenant: "northwell",         Region: "wd1", Site: "Northwell_Health_External"},
	{Display: "Mayo Clinic",             Tenant: "mayofoundation",    Region: "wd1", Site: "Mayo_External"},
	{Display: "Providence Health",       Tenant: "providence",        Region: "wd1", Site: "External"},
	{Display: "McLaren Health Care",     Tenant: "mclaren",           Region: "wd1", Site: "External"},

	// Retail / food service (Phase 2 - retail expansion).
	{Display: "Macy's",                  Tenant: "macys",             Region: "wd1", Site: "External"},
	{Display: "McDonald's",              Tenant: "mcdonalds",         Region: "wd1", Site: "External"},

	// Canada expansion 2026-05-12. The Canadian inventory is ~2.5% of the
	// index; this seed batch targets the largest Canadian employers across
	// banking, telecom, retail, tech, and healthcare to lift recall on
	// country=CA queries. Slugs are speculative where vendor docs don't
	// expose them publicly; 404s log+skip, no breakage.

	// Canadian banks (Workday-heavy sector).
	{Display: "RBC",                     Tenant: "rbc",               Region: "wd3", Site: "RBC_Careers"},
	{Display: "TD Bank",                 Tenant: "td",                Region: "wd3", Site: "TD_External_Career_Site"},
	{Display: "Scotiabank",              Tenant: "scotiabank",        Region: "wd3", Site: "Scotiabank_Careers"},
	{Display: "BMO",                     Tenant: "bmo",               Region: "wd3", Site: "External"},
	{Display: "CIBC",                    Tenant: "cibc",              Region: "wd3", Site: "campus"},
	{Display: "Sun Life Financial",      Tenant: "sunlife",           Region: "wd3", Site: "Sunlife"},
	{Display: "Manulife",                Tenant: "manulife",          Region: "wd3", Site: "External"},

	// Canadian telecom.
	{Display: "Bell Canada",             Tenant: "bell",              Region: "wd3", Site: "Bell_External_Career_Site"},
	{Display: "Rogers Communications",   Tenant: "rogers",            Region: "wd3", Site: "Rogers_External_Career_Site"},
	{Display: "TELUS",                   Tenant: "telus",             Region: "wd3", Site: "Telus_External_Career_Site"},

	// Canadian retail / consumer.
	{Display: "Loblaw Companies",        Tenant: "loblaw",            Region: "wd3", Site: "External"},
	{Display: "Canadian Tire",           Tenant: "canadiantire",      Region: "wd3", Site: "External"},
	{Display: "Lululemon",               Tenant: "lululemon",         Region: "wd5", Site: "External"},
	{Display: "Sobeys",                  Tenant: "sobeys",            Region: "wd3", Site: "External"},

	// Canadian tech / enterprise.
	{Display: "OpenText",                Tenant: "opentext",          Region: "wd3", Site: "External"},
	{Display: "BlackBerry",              Tenant: "blackberry",        Region: "wd3", Site: "External"},
	{Display: "CGI",                     Tenant: "cgi",               Region: "wd3", Site: "External"},
	{Display: "Bombardier",              Tenant: "bombardier",        Region: "wd3", Site: "External"},

	// Canadian transport / aerospace.
	{Display: "Air Canada",              Tenant: "aircanada",         Region: "wd3", Site: "External"},
	{Display: "CN Rail",                 Tenant: "cn",                Region: "wd3", Site: "External"},

	// Canadian hospital networks. The handoff has these as a TODO in the
	// phase-2 plan; slugs unverified, the next crawler pass will surface
	// which 404.
	{Display: "Sunnybrook Health Sciences Centre", Tenant: "sunnybrook", Region: "wd3", Site: "External"},
	{Display: "University Health Network",         Tenant: "uhn",        Region: "wd3", Site: "External"},
	{Display: "Alberta Health Services",           Tenant: "ahs",        Region: "wd3", Site: "External"},
	{Display: "Vancouver Coastal Health",          Tenant: "vch",        Region: "wd3", Site: "External"},
	{Display: "Hamilton Health Sciences",          Tenant: "hhsc",       Region: "wd3", Site: "External"},

	// Canada expansion 2026-05-15 (round 2). Round 1 (2026-05-12) targeted
	// banks/telecom/retail; this batch fills in the rest of the TSX top-100
	// where the company likely runs Workday. Energy + mining + insurance
	// are the biggest gaps (40+ of the largest Canadian employers by
	// headcount). 30-50% of slugs will 404 - that's the documented trade-off
	// for breadth over precision; the crawler logs+skips, no breakage.

	// Energy / oil & gas - Calgary-centric, mostly Workday-on-wd3.
	{Display: "Suncor Energy",           Tenant: "suncor",            Region: "wd3", Site: "External"},
	{Display: "Enbridge",                Tenant: "enbridge",          Region: "wd3", Site: "External_Career_Site"},
	{Display: "TC Energy",               Tenant: "tcenergy",          Region: "wd3", Site: "External"},
	{Display: "Cenovus Energy",          Tenant: "cenovus",           Region: "wd3", Site: "External"},
	{Display: "Imperial Oil",            Tenant: "imperialoil",       Region: "wd3", Site: "External"},
	{Display: "Canadian Natural Resources", Tenant: "cnrl",           Region: "wd3", Site: "External"},
	{Display: "Pembina Pipeline",        Tenant: "pembina",           Region: "wd3", Site: "External"},

	// Mining / minerals.
	{Display: "Teck Resources",          Tenant: "teckresources",     Region: "wd3", Site: "External"},
	{Display: "Barrick Gold",            Tenant: "barrick",           Region: "wd3", Site: "External"},
	{Display: "Nutrien",                 Tenant: "nutrien",           Region: "wd3", Site: "External_Career_Site"},
	{Display: "Agnico Eagle Mines",      Tenant: "agnicoeagle",       Region: "wd3", Site: "External"},
	{Display: "First Quantum Minerals",  Tenant: "firstquantum",      Region: "wd3", Site: "External"},
	{Display: "Cameco",                  Tenant: "cameco",            Region: "wd3", Site: "External"},

	// Auto parts / manufacturing - Ontario-centric.
	{Display: "Magna International",     Tenant: "magna",             Region: "wd3", Site: "External"},
	{Display: "Linamar",                 Tenant: "linamar",           Region: "wd3", Site: "External"},
	{Display: "Martinrea International", Tenant: "martinrea",         Region: "wd3", Site: "External"},
	{Display: "Celestica",               Tenant: "celestica",         Region: "wd3", Site: "External"},

	// Insurance + diversified financial.
	{Display: "Intact Financial",        Tenant: "intactfc",          Region: "wd3", Site: "External"},
	{Display: "iA Financial",            Tenant: "iafinancial",       Region: "wd3", Site: "External"},
	{Display: "Power Corporation",       Tenant: "powercorp",         Region: "wd3", Site: "External"},
	{Display: "Great-West Lifeco",       Tenant: "greatwest",         Region: "wd3", Site: "External"},
	{Display: "Fairfax Financial",       Tenant: "fairfax",           Region: "wd3", Site: "External"},
	{Display: "National Bank of Canada", Tenant: "nbc",               Region: "wd3", Site: "External"},
	{Display: "Desjardins",              Tenant: "desjardins",        Region: "wd3", Site: "External_Career_Site"},
	{Display: "Equitable Bank",          Tenant: "equitablebank",     Region: "wd3", Site: "External"},

	// Retail / consumer (rest of the top tier).
	{Display: "Alimentation Couche-Tard", Tenant: "couchetard",       Region: "wd3", Site: "External"},
	{Display: "Empire Company",          Tenant: "empireco",          Region: "wd3", Site: "External"},
	{Display: "Metro Inc",               Tenant: "metroinc",          Region: "wd3", Site: "External"},
	{Display: "Hudson's Bay",            Tenant: "hbc",               Region: "wd3", Site: "External"},
	{Display: "Indigo Books",            Tenant: "indigo",            Region: "wd3", Site: "External"},
	{Display: "Aritzia",                 Tenant: "aritzia",           Region: "wd3", Site: "External"},
	{Display: "Saputo",                  Tenant: "saputo",            Region: "wd3", Site: "External"},
	{Display: "Restaurant Brands International", Tenant: "rbi",       Region: "wd3", Site: "External"},
	{Display: "George Weston",           Tenant: "weston",            Region: "wd3", Site: "External"},
	{Display: "Tim Hortons",             Tenant: "timhortons",        Region: "wd3", Site: "External"},

	// Crown corporations + utilities.
	{Display: "Canada Post",             Tenant: "canadapost",        Region: "wd3", Site: "External"},
	{Display: "VIA Rail",                Tenant: "viarail",           Region: "wd3", Site: "External"},
	{Display: "Hydro One",               Tenant: "hydroone",          Region: "wd3", Site: "External"},
	{Display: "BC Hydro",                Tenant: "bchydro",           Region: "wd3", Site: "External"},
	{Display: "Hydro-Québec",            Tenant: "hydroquebec",       Region: "wd3", Site: "External"},
	{Display: "Ontario Power Generation", Tenant: "opg",              Region: "wd3", Site: "External"},
	{Display: "Atomic Energy Canada",    Tenant: "cnl",               Region: "wd3", Site: "External"},

	// Transport / logistics.
	{Display: "CP Rail",                 Tenant: "cpkc",              Region: "wd3", Site: "External"},
	{Display: "WestJet",                 Tenant: "westjet",           Region: "wd3", Site: "External"},
	{Display: "Air Transat",             Tenant: "transat",           Region: "wd3", Site: "External"},

	// Tech / SaaS (Workday-running Canadian tech that isn't already
	// captured via Greenhouse/Lever lists below).
	{Display: "Constellation Software", Tenant: "csi",                Region: "wd3", Site: "External"},
	{Display: "Open Text",               Tenant: "opentext",          Region: "wd3", Site: "External_Career_Site"},
	{Display: "Mitel",                   Tenant: "mitel",             Region: "wd3", Site: "External"},
	{Display: "Cogeco",                  Tenant: "cogeco",            Region: "wd3", Site: "External"},

	// Telecom (round 2).
	{Display: "Quebecor",                Tenant: "quebecor",          Region: "wd3", Site: "External"},
	{Display: "Vidéotron",               Tenant: "videotron",         Region: "wd3", Site: "External"},
	{Display: "SaskTel",                 Tenant: "sasktel",           Region: "wd3", Site: "External"},

	// Healthcare networks (round 2).
	{Display: "SickKids",                Tenant: "sickkids",          Region: "wd3", Site: "External"},
	{Display: "Centre for Addiction and Mental Health", Tenant: "camh", Region: "wd3", Site: "External"},
	{Display: "Mount Sinai Hospital Toronto", Tenant: "mountsinai-toronto", Region: "wd3", Site: "External"},
	{Display: "Trillium Health Partners", Tenant: "trillium",         Region: "wd3", Site: "External"},
	{Display: "Fraser Health Authority", Tenant: "fraserhealth",      Region: "wd3", Site: "External"},
	{Display: "Island Health",           Tenant: "islandhealth",      Region: "wd3", Site: "External"},
	{Display: "Saskatchewan Health Authority", Tenant: "saskhealth",  Region: "wd3", Site: "External"},
	{Display: "Shared Health Manitoba",  Tenant: "sharedhealth",      Region: "wd3", Site: "External"},
	{Display: "Nova Scotia Health",      Tenant: "nshealth",          Region: "wd3", Site: "External"},

	// Universities (Workday-running; many CA universities also use PageUp
	// which we don't have an adapter for - those go via sitemap+JSON-LD).
	{Display: "University of Toronto",   Tenant: "uoft",              Region: "wd3", Site: "External"},
	{Display: "University of British Columbia", Tenant: "ubc",        Region: "wd3", Site: "External"},
	{Display: "McGill University",       Tenant: "mcgill",            Region: "wd3", Site: "External"},
	{Display: "University of Waterloo",  Tenant: "uwaterloo",         Region: "wd3", Site: "External"},
	{Display: "McMaster University",     Tenant: "mcmaster",          Region: "wd3", Site: "External"},
	{Display: "Western University",      Tenant: "uwo",               Region: "wd3", Site: "External"},
	{Display: "Queen's University",      Tenant: "queensu",           Region: "wd3", Site: "External"},
	{Display: "University of Alberta",   Tenant: "ualberta",          Region: "wd3", Site: "External"},
	{Display: "University of Calgary",   Tenant: "ucalgary",          Region: "wd3", Site: "External"},
	{Display: "Simon Fraser University", Tenant: "sfu",               Region: "wd3", Site: "External"},
	{Display: "York University",         Tenant: "yorku",             Region: "wd3", Site: "External"},
	{Display: "Concordia University",    Tenant: "concordia",         Region: "wd3", Site: "External"},
	{Display: "Université de Montréal",  Tenant: "umontreal",         Region: "wd3", Site: "External"},
	{Display: "University of Ottawa",    Tenant: "uottawa",           Region: "wd3", Site: "External"},
	{Display: "Dalhousie University",    Tenant: "dal",               Region: "wd3", Site: "External"},

	// Big-tech + known-startup expansion 2026-05-14. Workday tenants for
	// major US enterprise hirers not already covered. Region guesses are
	// pattern-matched to nearby companies in the same vertical; 404s on
	// wrong region/site logs+skips, the crawler self-heals.

	// Semiconductor / chips
	{Display: "Marvell",                 Tenant: "marvell",           Region: "wd1", Site: "Marvell"},
	{Display: "Microchip Technology",    Tenant: "microchip",         Region: "wd1", Site: "Microchip"},
	{Display: "Analog Devices",          Tenant: "analogdevices",     Region: "wd1", Site: "External"},
	{Display: "Skyworks Solutions",      Tenant: "skyworks",          Region: "wd5", Site: "Skyworks"},
	{Display: "ON Semiconductor",        Tenant: "onsemiconductor",   Region: "wd5", Site: "External"},
	{Display: "Lattice Semiconductor",   Tenant: "lscc",              Region: "wd5", Site: "External"},
	{Display: "GlobalFoundries",         Tenant: "globalfoundries",   Region: "wd1", Site: "External"},

	// Industrial / aerospace / energy
	{Display: "Honeywell",               Tenant: "honeywell",         Region: "wd1", Site: "External_Careers"},
	{Display: "Caterpillar",             Tenant: "caterpillar",       Region: "wd5", Site: "CAT_Careers"},
	{Display: "Deere",                   Tenant: "deere",             Region: "wd5", Site: "JohnDeere"},
	{Display: "Emerson",                 Tenant: "emerson",           Region: "wd5", Site: "Emerson_Careers"},
	{Display: "Eaton",                   Tenant: "eaton",             Region: "wd5", Site: "Eaton_External_Career"},
	{Display: "3M",                      Tenant: "3m",                Region: "wd1", Site: "Search"},
	{Display: "Northrop Grumman",        Tenant: "ngc",               Region: "wd1", Site: "NGC_External"},
	{Display: "General Dynamics",        Tenant: "gd",                Region: "wd1", Site: "External"},

	// Automotive
	{Display: "Honda",                   Tenant: "honda",             Region: "wd5", Site: "HCNACAREERS"},
	{Display: "Toyota North America",    Tenant: "toyota",            Region: "wd1", Site: "External"},
	{Display: "Stellantis",              Tenant: "stellantis",        Region: "wd1", Site: "External"},

	// Pharma / biotech
	{Display: "Johnson & Johnson",       Tenant: "jnj",               Region: "wd1", Site: "jnjcareers"},
	{Display: "Merck",                   Tenant: "merck",             Region: "wd5", Site: "External"},
	{Display: "Bristol Myers Squibb",    Tenant: "bms",               Region: "wd1", Site: "BMS"},
	{Display: "AbbVie",                  Tenant: "abbvie",            Region: "wd1", Site: "External"},
	{Display: "Regeneron",               Tenant: "regeneron",         Region: "wd5", Site: "Regeneron_Careers"},

	// Consulting / staffing
	{Display: "Accenture",               Tenant: "accenture",         Region: "wd3", Site: "External"},
	{Display: "Capgemini",               Tenant: "capgemini",         Region: "wd3", Site: "External"},
	{Display: "Deloitte",                Tenant: "deloitte",          Region: "wd1", Site: "External"},
	{Display: "EY",                      Tenant: "ey",                Region: "wd1", Site: "EY_Careers"},
	{Display: "KPMG",                    Tenant: "kpmg",              Region: "wd1", Site: "External"},

	// Tech mid-cap (Workday)
	{Display: "DocuSign",                Tenant: "docusign",          Region: "wd1", Site: "Docusign_Career_Site"},
	{Display: "Twilio",                  Tenant: "twilio",            Region: "wd1", Site: "External"},
	{Display: "Box",                     Tenant: "box",               Region: "wd1", Site: "External_Career_Site"},
	{Display: "Coupa",                   Tenant: "coupa",             Region: "wd1", Site: "Coupa_Careers"},
	{Display: "Veeva Systems",           Tenant: "veeva",             Region: "wd5", Site: "Veeva"},
	{Display: "Anaplan",                 Tenant: "anaplan",           Region: "wd5", Site: "Anaplan_External"},
	{Display: "Procore",                 Tenant: "procore",           Region: "wd5", Site: "Procore_External"},
	{Display: "Cloudflare",              Tenant: "cloudflare",        Region: "wd5", Site: "Cloudflare"},
	{Display: "Dropbox",                 Tenant: "dropbox",           Region: "wd5", Site: "External"},
	{Display: "Yelp",                    Tenant: "yelp",              Region: "wd5", Site: "External"},
}

var DefaultRecruitee = []string{
	"catawiki",
	"helloprint",
	"swapfiets",
	"airfocus",
	"camunda",
	"miro",
	"tweakers",
	"mews",
	"vivino",
	"wallapop",
	"tier",
	"tiermobility",
	"trivago",
	"getyourguide",
	"booking",
	"contentful",
	"babbel",
	"hellofresh",
	"factorial",
	"factorialhr",
	"backbase",
	"bunq",
	"adyen",
	"messagebird",
	"bird",
	"silverfin",
	"shapeshift",
	"otrium",
	"jobandtalent",
	"taxfix",
	"luno",
	"pleo",
	"lottiefiles",
	"unbabel",
	"talkpush",
	"bynder",
	"templafy",
	"yousign",
	"germanytechjobs",
	"raisin",
	"checkstep",
	"sellforte",
	"meneuren",
	"flexiana",

	// auto-discovered 2026-05-07 (2)
	"deepl",
	"etsy",

	// auto-discovered 2026-05-13 (1)
	"translink",
}

// DefaultPersonio - Personio tenant slugs at {slug}.jobs.personio.com/xml.
// Personio's public XML feed is opt-in per tenant and Cloudflare-fronted;
// many slugs that exist in the Personio admin do not actually expose the
// feed publicly. Defaults are kept conservative; operators populate via
// PERSONIO_COMPANIES=<csv> after verifying the feed responds to a manual
// curl from the deploy environment.
var DefaultPersonio = []string{
	// Known to publish public feeds at the time of writing.
	"awin",
}

// DefaultTeamtailor - Teamtailor tenant slugs at {slug}.teamtailor.com. The
// list is intentionally short until tenants are individually verified; many
// Teamtailor customers use branded `careers.{company}.com` CNAMEs whose
// underlying tenant slug isn't the company name. Operators can override via
// TEAMTAILOR_COMPANIES=<csv>.
var DefaultTeamtailor = []string{
	"paradox",
}

// DefaultBambooHR - tenant slugs at {slug}.bamboohr.com. BambooHR is mostly
// SMB; tenants without a public careers feed redirect /careers/list to the
// BambooHR marketing homepage and surface as `non-json` errors during fetch.
// Operators override via BAMBOOHR_COMPANIES=<csv>.
var DefaultBambooHR = []string{
	"canopy",
	"roomraccoon",
	"flashfood",
	"asana",
	"buoyhealth",
	"afar",
	"testlio",
	"instabase",

	// auto-discovered 2026-05-07 (57)
	"acceldata",
	"aircall",
	"alan",
	"algolia",
	"apollo",
	"beehiiv",
	"census",
	"chime",
	"clickhouse",
	"cohere",
	"dashlane",
	"devrev",
	"dune",
	"ea",
	"educative",
	"eleven",
	"flyio",
	"forward",
	"front",
	"helix",
	"influxdata",
	"lido",
	"lightspeed",
	"linear",
	"masterclass",
	"masterworks",
	"medium",
	"mirakl",
	"multiplier",
	"mux",
	"netlify",
	"openai",
	"opensea",
	"outrider",
	"palantir",
	"paytm",
	"pilot",
	"pliant",
	"posthog",
	"pushsecurity",
	"rippling",
	"roblox",
	"scaleai",
	"shipt",
	"skymavis",
	"sorare",
	"sourcegraph",
	"sui",
	"synthego",
	"tipalti",
	"udacity",
	"varo",
	"vercel",
	"vivun",
	"wealthsimple",
	"you",
	"zepto",

	// auto-discovered 2026-05-13 (29)
	"ada",
	"applyboard",
	"bellmedia",
	"borrowell",
	"cinchy",
	"doordash",
	"enbridge",
	"float",
	"hopper",
	"ibigroup",
	"kindred",
	"klipfolio",
	"koho",
	"league",
	"loopio",
	"maple",
	"mec",
	"pomerleau",
	"procurify",
	"rangle",
	"rb",
	"recurly",
	"rewind",
	"rocketdoctor",
	"stream",
	"thinkific",
	"trulioo",
	"voiceflow",
	"wattpad",
}

// DefaultBreezy - tenant slugs at {slug}.breezy.hr. Breezy's CDN 403s any
// non-browser UA on the root host and on slugs that don't host a public
// careers page; only slugs verified to return non-empty feeds are seeded here.
var DefaultBreezy = []string{
	"servers-com",
	"cometeer",
	"erdman-anthony",
	"intrahealth",
}

// DefaultPinpoint - tenant slugs at {slug}.pinpointhq.com. Pinpoint's UK/EU
// SMB customer base; the list seeds enterprise + scale-up tenants whose
// /postings.json was verified to return live jobs.
var DefaultPinpoint = []string{
	"nccgroup",
	"multiplier-careers",
	"cartesian",
	"upway",
	"vena",
	"digitalscience",
	"discogsinc",
	"reconomy",

	// auto-discovered 2026-05-07 (39)
	"alan",
	"allbirds",
	"amplitude",
	"ancestry",
	"apollo",
	"aqua-security",
	"beehiiv",
	"bolt",
	"carbonhealth",
	"clerk",
	"clickup",
	"cybereason",
	"deel",
	"dune",
	"elastic",
	"getyourguide",
	"hellofresh",
	"helsing",
	"influxdata",
	"intercom",
	"kraken",
	"magic",
	"mambu",
	"medium",
	"multiplier",
	"neon",
	"owkin",
	"razorpay",
	"shipt",
	"shopify",
	"sketch",
	"sofi",
	"sui",
	"sunrun",
	"tidio",
	"vestiairecollective",
	"yelp",
	"you",
	"zoox",

	// auto-discovered 2026-05-13 (8)
	"achievers",
	"ada",
	"float",
	"rewind",
	"touchbistro",
	"trulioo",
	"ttc",
	"venasolutions",
}

// DefaultMuseCategories - placeholder; The Muse adapter currently paginates
// the unfiltered /jobs feed (~500k postings) instead of category-filtering,
// so this list is unused but kept for future per-category fan-out.
var DefaultMuseCategories = []string{
	"Software Engineer",
	"Data Science",
	"Product",
	"Design",
}
