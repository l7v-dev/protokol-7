<script>
	import { goto } from '$app/navigation';
	import { WEBUI_NAME, config } from '$lib/stores';
	import { onMount, getContext } from 'svelte';

	const i18n = getContext('i18n');

	let loaded = false;

	onMount(async () => {
		if ($config) {
			await goto('/');
		}

		loaded = true;
	});
</script>

{#if loaded}
	<div class="absolute w-full h-full flex z-50">
		<div class="absolute rounded-xl w-full h-full backdrop-blur-sm flex justify-center">
			<div class="m-auto pb-44 flex flex-col justify-center">
				<div class="max-w-md">
					<div class="text-center text-2xl font-normal z-50">
						{$i18n.t('{{webUIName}} Backend Required', { webUIName: $WEBUI_NAME })}
					</div>

					<div class=" mt-4 text-center text-sm w-full">
						{$i18n.t(
							"Oops! You're using an unsupported method (frontend only). Please ensure the Protokol-7 backend is running."
						)}

						<br class=" " />
						<br class=" " />
						<a
							class=" font-normal underline"
							href="https://github.com/protokol-7/protokol-7#how-to-install-"
							target="_blank">{$i18n.t('See readme.md for instructions')}</a
						>
						{$i18n.t('or')}
						<a class=" font-normal underline" href="https://github.com/protokol-7/protokol-7" target="_blank"
							>{$i18n.t('check our documentation for help.')}</a
						>
					</div>

					<div class=" mt-6 mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 relative group w-fit">
						<button
							class="relative z-20 flex px-5 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition font-normal text-sm text-black"
							on:click={() => {
								location.href = '/';
							}}
						>
							{$i18n.t('Check Again')}
						</button>
						<button
							class="relative z-20 flex px-5 py-2 rounded-full bg-black text-white hover:bg-gray-800 transition font-normal text-sm dark:bg-white dark:text-black dark:hover:bg-gray-200"
							on:click={async () => {
								await config.set({
									status: true,
									name: 'Protokol-7',
									version: '0.1.0',
									default_locale: 'en-US',
									default_models: '',
									features: {
										auth: false,
										enable_signup: true,
										enable_login_form: true,
										enable_websocket: false
									},
									ui: {
										pending_user_overlay: false
									}
								});
								await goto('/');
							}}
						>
							{$i18n.t('Continue in Preview / Standalone Mode')}
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
