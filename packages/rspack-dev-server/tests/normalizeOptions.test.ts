import { RspackOptions, rspack } from "@rspack/core";
import { RspackDevServer, Configuration } from "@rspack/dev-server";
import { createCompiler } from "@rspack/core";
import ReactRefreshPlugin from "@rspack/plugin-react-refresh";
// @ts-expect-error
import serializer from "jest-serializer-path";
expect.addSnapshotSerializer(serializer);

// The aims of use a cutstom value rather than
// default is to avoid stack overflow trigged
// by `webpack/schemas/WebpackOption.check.js` in debug mode
const ENTRY = "./placeholder.js";
const ENTRY1 = "./placeholder1.js";

describe("normalize options snapshot", () => {
	it("no options", async () => {
		await match({});
	});

	it("port string", async () => {
		await match({
			devServer: {
				port: "9000"
			}
		});
	});

	it("additional entires should added", async () => {
		expect(
			await getAdditionEntries({}, { entry: ["something"] })
		).toMatchSnapshot();
	});

	it("react-refresh client added when react/refresh enabled", async () => {
		expect(
			await getAdditionEntries(
				{},
				{
					entry: ["something"],
					builtins: {
						react: {
							refresh: true
						}
					}
				}
			)
		).toMatchSnapshot();
	});

	it("shouldn't have reactRefreshEntry.js when react.refresh is false", async () => {
		expect(
			await getAdditionEntries(
				{},
				{
					entry: ["something"],
					builtins: {
						react: {
							refresh: false
						}
					}
				}
			)
		).toMatchSnapshot();
	});

	it("shouldn't have reactRefreshEntry.js by default when rspackFuture.disableReactRefreshByDefault is enabled", async () => {
		const reactRefreshEntry =
			"<prefix>/rspack-plugin-react-refresh/client/reactRefreshEntry.js";
		const entries1 = await getAdditionEntries(
			{},
			{
				entry: ["something"],
				experiments: {
					rspackFuture: {
						disableTransformByDefault: true
					}
				}
			}
		);
		expect(entries1["undefined"]).not.toContain(reactRefreshEntry);
		const entries2 = await getAdditionEntries(
			{},
			{
				entry: ["something"],
				plugins: [new ReactRefreshPlugin()],
				experiments: {
					rspackFuture: {
						disableTransformByDefault: true
					}
				}
			}
		);
		expect(entries2["undefined"]).toContain(reactRefreshEntry);
	});

	it("react.development and react.refresh should be true by default when hot enabled", async () => {
		const compiler = createCompiler({
			entry: ENTRY,
			stats: "none"
		});
		const server = new RspackDevServer(
			{
				hot: true
			},
			compiler
		);
		await server.start();
		expect(compiler.options.builtins.react?.refresh).toBe(true);
		expect(compiler.options.builtins.react?.development).toBe(true);
		await server.stop();
	});

	it("hot should be true by default", async () => {
		const compiler = createCompiler({
			entry: ENTRY,
			stats: "none"
		});
		const server = new RspackDevServer({}, compiler);
		await server.start();
		expect(compiler.options.devServer?.hot).toBe(true);
		expect(server.options.hot).toBe(true);
		await server.stop();
	});

	it("should support multi-compiler", async () => {
		const compiler = rspack([
			{
				entry: ENTRY,
				stats: "none"
			},
			{
				entry: ENTRY1,
				stats: "none"
			}
		]);
		const server = new RspackDevServer({}, compiler);
		await server.start();
		await server.stop();
	});
});

async function match(config: RspackOptions) {
	const compiler = createCompiler({
		...config,
		entry: ENTRY,
		stats: "none"
	});
	const server = new RspackDevServer(
		compiler.options.devServer ?? {},
		compiler
	);
	await server.start();
	// it will break ci
	//@ts-ignore
	delete server.options.port;
	expect(server.options).toMatchSnapshot();
	await server.stop();
}

async function getAdditionEntries(
	serverConfig: Configuration,
	config: RspackOptions
) {
	const compiler = createCompiler({
		...config,
		stats: "none",
		entry: ENTRY
	});

	const server = new RspackDevServer(serverConfig, compiler);
	await server.start();
	const entries = compiler.builtinPlugins
		.filter(p => p.name === "EntryPlugin")
		.map(p => p.raw().options)
		.reduce<Object>((acc, cur: any) => {
			const name = cur.options.name;
			const request = cur.entry;
			// @ts-expect-error
			if (acc[name]) {
				// @ts-expect-error
				acc[name].import.push(request);
			} else {
				// @ts-expect-error
				acc[name] = { import: [request] };
			}
			return acc;
		}, {});
	// some hack for snapshot
	const value = Object.fromEntries(
		Object.entries(entries).map(([key, item]) => {
			// @ts-expect-error
			const replaced = item.import?.map(entry => {
				const array = entry
					.replace(/\\/g, "/")
					.replace(/port=\d+/g, "")
					.split("/");
				return "<prefix>" + "/" + array.slice(-3).join("/");
			});
			return [key, replaced];
		})
	);
	await server.stop();
	return value;
}
