import { Notice, setIcon, TFile, TFolder, normalizePath } from 'obsidian';
import type { AudioClip, CardRecord } from './card';
import type FakeCardPlugin from '../main';
import { tt, ttf } from './i18n';

/** Recordings live next to the card library, never in the user's notes. */
export function audioFolder(plugin: FakeCardPlugin): string {
    return normalizePath(`${plugin.store.folder}/media`);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `20261123-234512`: unique, sorts by time, safe in a file name. */
export function clipStamp(date = new Date()): string {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
        + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** The editable label a new clip starts with: the same moment, readable. */
export function clipTitle(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function extensionFor(type: string): string {
    if (type.includes('mp4')) return 'm4a';
    if (type.includes('ogg')) return 'ogg';
    return 'webm';
}

function pickMime(): string {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return '';
    }
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

/**
 * The microphone is opened only while the button says "stop": closing the
 * panel, or pressing stop, releases the track again.
 */
class ClipRecorder {
    private media: MediaRecorder | null = null;
    private stream: MediaStream | null = null;
    private chunks: Blob[] = [];

    async start(): Promise<boolean> {
        if (this.media) return true;
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            new Notice(tt('Recording is not available on this device.'));
            return false;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            new Notice(ttf('Could not start recording: {message}', { message: `${error}` }));
            return false;
        }

        let media: MediaRecorder;
        try {
            const mime = pickMime();
            media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        } catch (error) {
            for (const track of stream.getTracks()) track.stop();
            new Notice(ttf('Could not start recording: {message}', { message: `${error}` }));
            return false;
        }

        this.chunks = [];
        media.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) this.chunks.push(event.data);
        });
        media.start();
        this.media = media;
        this.stream = stream;
        return true;
    }

    async stop(): Promise<Blob | null> {
        const media = this.media;
        if (!media) return null;
        const blob = await new Promise<Blob>((resolve) => {
            media.addEventListener('stop', () => {
                resolve(new Blob(this.chunks, { type: media.mimeType || 'audio/webm' }));
            }, { once: true });
            media.stop();
        });
        this.cleanup();
        return blob.size > 0 ? blob : null;
    }

    cancel(): void {
        if (this.media && this.media.state !== 'inactive') {
            try {
                this.media.stop();
            } catch {
                // Already stopped by the browser; the tracks are all that matter.
            }
        }
        this.cleanup();
    }

    private cleanup(): void {
        for (const track of this.stream?.getTracks() ?? []) track.stop();
        this.stream = null;
        this.media = null;
        this.chunks = [];
    }
}

/** Write one recorded blob into the library's media folder. */
export async function saveRecording(plugin: FakeCardPlugin, blob: Blob): Promise<AudioClip | null> {
    try {
        const folder = audioFolder(plugin);
        if (!(plugin.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
            await plugin.app.vault.createFolder(folder);
        }

        const extension = extensionFor(blob.type);
        const stamp = clipStamp();
        let path = normalizePath(`${folder}/${stamp}.${extension}`);
        let suffix = 2;
        while (plugin.app.vault.getAbstractFileByPath(path)) {
            path = normalizePath(`${folder}/${stamp}-${suffix}.${extension}`);
            suffix++;
        }

        await plugin.app.vault.createBinary(path, await blob.arrayBuffer());
        return { file: path, title: clipTitle(), created: new Date().toISOString() };
    } catch (error) {
        console.error('[fakecard] could not save the recording', error);
        new Notice(ttf('Could not save the recording: {message}', { message: `${error}` }));
        return null;
    }
}

/** Remove the audio file of a clip; the card entry is the caller's business. */
export async function deleteRecording(plugin: FakeCardPlugin, clip: AudioClip): Promise<void> {
    const file = plugin.app.vault.getAbstractFileByPath(clip.file);
    if (!(file instanceof TFile)) return;
    try {
        await plugin.app.fileManager.trashFile(file);
    } catch {
        // Locked or already gone; the file is only a recording, not a source.
    }
}

/**
 * Players for the review card: one strip above the card, so the recording is
 * available before the answer is revealed (a listening prompt) and after it
 * (a recording of your own answer). Nothing plays by itself.
 */
export function renderAudioStrip(
    plugin: FakeCardPlugin,
    container: HTMLElement,
    card: CardRecord,
): void {
    const clips = card.audio ?? [];
    if (!plugin.settings.audioEnabled || clips.length === 0) return;

    const strip = container.createDiv({ cls: 'fakecard-audio-strip' });
    strip.createSpan({
        cls: 'fakecard-audio-strip-label',
        text: `${tt('Recordings')} · ${clips.length}`,
    });

    for (const clip of clips) {
        const row = strip.createDiv({ cls: 'fakecard-audio-strip-row' });
        row.createSpan({ cls: 'fakecard-audio-strip-title', text: clip.title });
        const file = plugin.app.vault.getAbstractFileByPath(clip.file);
        if (file instanceof TFile) {
            const audio = row.createEl('audio', { cls: 'fakecard-audio-player' });
            audio.controls = true;
            audio.preload = 'none';
            audio.src = plugin.app.vault.getResourcePath(file);
        } else {
            row.createSpan({ cls: 'fakecard-audio-missing', text: tt('File is missing') });
        }
    }
}

export interface AudioEditorHandle {
    /** Stop a recording in progress when the panel closes. */
    dispose(): void;
}

/**
 * The recordings section of an edit panel. Only existing cards get one: a new
 * card has no id to save into, so it records after the first save.
 *
 * Recording is a file-level action, so every change here is written at once
 * instead of waiting for the panel's own Save: a recording can never be lost
 * by pressing Cancel, and a deleted clip takes its file with it.
 */
export function renderAudioEditor(
    plugin: FakeCardPlugin,
    container: HTMLElement,
    card: CardRecord,
): AudioEditorHandle {
    if (!plugin.settings.audioEnabled) return { dispose: () => {} };

    const section = container.createDiv({ cls: 'fakecard-audio-section' });
    const head = section.createDiv({ cls: 'fakecard-audio-head' });
    head.createEl('label', { cls: 'fakecard-field-label', text: tt('Recordings') });

    const record = head.createEl('button', { cls: 'fakecard-audio-record', attr: { type: 'button' } });
    const recordIcon = record.createSpan({ cls: 'fakecard-audio-record-icon' });
    setIcon(recordIcon, 'mic');
    const recordLabel = record.createSpan({ text: tt('Record') });

    const list = section.createDiv({ cls: 'fakecard-audio-list' });
    let recorder: ClipRecorder | null = null;

    const save = async (): Promise<void> => {
        if (await plugin.store.save(card)) plugin.notifyCardEdited();
    };

    const draw = (): void => {
        list.empty();
        const clips = card.audio ?? [];
        if (clips.length === 0) {
            list.createDiv({ cls: 'fakecard-audio-empty', text: tt('No recordings yet.') });
            return;
        }

        for (const clip of clips) {
            const row = list.createDiv({ cls: 'fakecard-audio-row' });

            const title = row.createEl('input', {
                cls: 'fakecard-audio-title',
                type: 'text',
                attr: { 'aria-label': tt('Recording name') },
            });
            title.value = clip.title;
            title.addEventListener('change', () => {
                clip.title = title.value.trim() || clipTitle(new Date(clip.created));
                title.value = clip.title;
                void save();
            });

            const file = plugin.app.vault.getAbstractFileByPath(clip.file);
            if (file instanceof TFile) {
                const audio = row.createEl('audio', { cls: 'fakecard-audio-player' });
                audio.controls = true;
                audio.preload = 'none';
                audio.src = plugin.app.vault.getResourcePath(file);
            } else {
                row.createSpan({ cls: 'fakecard-audio-missing', text: tt('File is missing') });
            }

            const remove = row.createEl('button', {
                cls: 'fakecard-audio-delete',
                attr: { 'aria-label': tt('Delete recording') },
            });
            setIcon(remove, 'trash-2');
            remove.addEventListener('click', () => {
                void (async () => {
                    await deleteRecording(plugin, clip);
                    card.audio = (card.audio ?? []).filter((entry) => entry !== clip);
                    await save();
                    draw();
                })();
            });
        }
    };

    record.addEventListener('click', () => {
        void (async () => {
            if (recorder) {
                const blob = await recorder.stop();
                recorder = null;
                record.removeClass('is-recording');
                setIcon(recordIcon, 'mic');
                recordLabel.setText(tt('Record'));
                if (!blob) {
                    new Notice(tt('The recording is empty.'));
                    return;
                }
                const clip = await saveRecording(plugin, blob);
                if (!clip) return;
                card.audio = [...(card.audio ?? []), clip];
                await save();
                draw();
                return;
            }

            const next = new ClipRecorder();
            if (!await next.start()) return;
            recorder = next;
            record.addClass('is-recording');
            setIcon(recordIcon, 'square');
            recordLabel.setText(tt('Stop recording'));
        })();
    });

    draw();
    return {
        dispose: () => {
            recorder?.cancel();
            recorder = null;
        },
    };
}
