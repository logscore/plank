import { transcodeLibrary } from '../src/lib/server/transcoder';

console.log('Starting manual library optimization...');

async function run() {
	try {
		await transcodeLibrary();
		console.log('Library optimization complete!');
		process.exit(0);
	} catch (e) {
		console.error('Library optimization failed:', e);
		process.exit(1);
	}
}

run();
