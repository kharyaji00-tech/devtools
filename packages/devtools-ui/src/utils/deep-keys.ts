type IsAny<T> = 0 extends 1 & T ? true : false

type Clean<T> = Exclude<T, undefined | null>

type CollapsibleKeys<
  T,
  TPrefix extends string = '',
  TDepth extends Array<unknown> = [],
> = TDepth['length'] extends 10
  ? never
  : IsAny<T> extends true
    ? TPrefix extends ''
      ? never
      : TPrefix
    : T extends ReadonlyArray<infer U>
      ?
          | (TPrefix extends '' ? '' : TPrefix)
          | CollapsibleKeys<U, `${TPrefix}[${number}]`, [...TDepth, 0]>
      : T extends object
        ?
            | (TPrefix extends '' ? '' : TPrefix)
            | {
                [K in Extract<keyof T, string>]: CollapsibleKeys<
                  T[K],
                  TPrefix extends '' ? `${K}` : `${TPrefix}.${K}`,
                  [...TDepth, 0]
                >
              }[Extract<keyof T, string>]
        : never

export type CollapsiblePaths<T> =
  CollapsibleKeys<Clean<T>> extends infer P
    ? P extends string
      ? P
      : never
    : never
