// Built-in Whisper models for hot wash transcription (#425, ADR-0039). ONNX exports from the
// onnx-community organisation on Hugging Face (MIT-licensed OpenAI Whisper weights), pinned to
// a commit with the sha256 of every file the app downloads (the same check as MODEL_PINS for
// embeddings). Values come from the public hub API (revision/main with blobs, LFS sha256) and
// the small files hashed at the commit. Each one downloads only when the user clicks Download.
// (The tokenizer lines carry gitleaks:allow: they are public file checksums, not secrets.)
import type { FileSetPin } from '../../embedding/model-files'

/** Quantization per ONNX file, as transformers.js `dtype` takes it. */
export interface WhisperDtype {
  encoder_model: 'fp32' | 'q8'
  decoder_model_merged: 'fp32' | 'q8'
}

export interface WhisperModel {
  /** Hugging Face id; also the folder under userData/models. */
  id: string
  /** Short name shown in the UI. */
  name: string
  label: string
  params: string
  /** Bytes the download writes (all files). */
  downloadBytes: number
  /** English-only models take no language or task option. */
  multilingual: boolean
  /** Speed measured on Apple M-series (ADR-0041); x64 CPUs are slower. */
  speed: string
  dtype: WhisperDtype
  pin: FileSetPin
}

const CONFIG_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
] as const

const onnxFile = (part: keyof WhisperDtype, dtype: WhisperDtype): string =>
  `onnx/${part}${dtype[part] === 'q8' ? '_quantized' : ''}.onnx`

/** Files transformers.js reads for automatic-speech-recognition with this model's dtype. */
export function whisperFiles(model: WhisperModel): string[] {
  return [
    onnxFile('encoder_model', model.dtype),
    onnxFile('decoder_model_merged', model.dtype),
    ...CONFIG_FILES,
  ]
}

const PREPROCESSOR_SHA = 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'

export const WHISPER_MODELS: readonly WhisperModel[] = [
  {
    id: 'onnx-community/whisper-tiny.en',
    name: 'whisper-tiny.en',
    label: 'Fastest, English only',
    params: '39 M',
    downloadBytes: 66_400_000,
    multilingual: false,
    speed: 'About 2–3 minutes per hour of audio',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    pin: {
      revision: '2575352d61be1bf7225cf8f8b268a4678025fc58',
      sha256: {
        'onnx/encoder_model.onnx':
          '8c361b9430a5ef6619ee64b7fe06c725df19f36d508cc8b847064b34a888a3fe',
        'onnx/decoder_model_merged_quantized.onnx':
          'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52',
        'config.json': '251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233',
        'generation_config.json':
          '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9',
        'preprocessor_config.json': PREPROCESSOR_SHA,
        'tokenizer.json': '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0', // gitleaks:allow
        'tokenizer_config.json': '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c', // gitleaks:allow
      },
    },
  },
  {
    id: 'onnx-community/whisper-base',
    name: 'whisper-base',
    label: 'Default',
    params: '74 M',
    downloadBytes: 138_900_000,
    multilingual: true,
    speed: 'About 3 minutes per hour of audio',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    pin: {
      revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
      sha256: {
        'onnx/encoder_model.onnx':
          'a9f3b752833b49e880dec91ee5b6d936112be7c3ea07c221024ba493439f46fe',
        'onnx/decoder_model_merged_quantized.onnx':
          'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b',
        'config.json': 'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b',
        'generation_config.json':
          '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0',
        'preprocessor_config.json': PREPROCESSOR_SHA,
        'tokenizer.json': '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566', // gitleaks:allow
        'tokenizer_config.json': '2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573', // gitleaks:allow
      },
    },
  },
  {
    id: 'onnx-community/whisper-small',
    name: 'whisper-small',
    label: 'Recommended with 16 GB of memory or more',
    params: '244 M',
    downloadBytes: 251_900_000,
    multilingual: true,
    speed: 'About 6 minutes per hour of audio',
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    pin: {
      revision: '36050c46d777d46dc4b5f43f6d90574fc38f8732',
      sha256: {
        'onnx/encoder_model_quantized.onnx':
          'a43a83f3c5361cd591cfa7c36f14b43cf7cb22f47a415cc14a8d557be800fa92',
        'onnx/decoder_model_merged_quantized.onnx':
          'ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9',
        'config.json': '457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18',
        'generation_config.json':
          'f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0',
        'preprocessor_config.json': PREPROCESSOR_SHA,
        'tokenizer.json': '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566', // gitleaks:allow
        'tokenizer_config.json': '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce', // gitleaks:allow
      },
    },
  },
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    name: 'whisper-large-v3-turbo',
    label: 'Most accurate, slowest',
    params: '809 M',
    downloadBytes: 1_087_600_000,
    multilingual: true,
    speed: 'About 20 minutes per hour of audio (estimate)',
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    pin: {
      revision: '360ebcde2559d60bb474678be3c1de9ef347d01a',
      sha256: {
        'onnx/encoder_model_quantized.onnx':
          'd2f853dc3254fdc0079f55dd4433ea716ac98ec5574d3b475f288f2a77cebba9',
        'onnx/decoder_model_merged_quantized.onnx':
          '61481bd3be3a445d5a4b9070e8f8b2c6cc4fbbbbdc9f0e7ed048a132b8b84e0d',
        'config.json': '35cd83669f75bc2867f3b3a4461850392d5e308cd6ea951c3700539883c28df1',
        'generation_config.json':
          '16f95291d2f47c944d3c2b19390bba7965666555c1ea2a0bdc850d1fab45612f',
        'preprocessor_config.json':
          '7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711',
        'tokenizer.json': '6d8cbd7cd0d8d5815e478dac67b85a26bbe77c1f5e0c6d76d1ce2abc0e5f21ca', // gitleaks:allow
        'tokenizer_config.json': '844b642c73a91359722f47b35705f7174686df33d252695d8572cf9ac03a6389', // gitleaks:allow
      },
    },
  },
]

const SIXTEEN_GB = 16 * 1024 ** 3
/** Some machines report a little under their nominal memory. */
const SIXTEEN_GB_FLOOR = SIXTEEN_GB * 0.94

/** whisper-small on machines with 16 GB or more, whisper-base below (spec 0425, question 3). */
export function defaultWhisperModel(ramBytes: number): WhisperModel {
  const name = ramBytes >= SIXTEEN_GB_FLOOR ? 'whisper-small' : 'whisper-base'
  return WHISPER_MODELS.find((m) => m.name === name)!
}

/** A built-in model by id or short name; undefined for anything else. */
export function findWhisperModel(idOrName: string): WhisperModel | undefined {
  return WHISPER_MODELS.find((m) => m.id === idOrName || m.name === idOrName)
}
