let firebaseFunctionsModules: Promise<[
  typeof import("firebase/functions"),
  typeof import("./firebase"),
]> | undefined;

function loadFirebaseFunctionsModules() {
  firebaseFunctionsModules ??= Promise.all([
    import("firebase/functions"),
    import("./firebase"),
  ]);
  return firebaseFunctionsModules;
}

export async function callFirebaseFunction<Request, Response = unknown>(
  name: string,
  data: Request,
): Promise<Response> {
  const [{ httpsCallable }, { firebaseFunctions }] = await loadFirebaseFunctionsModules();
  const result = await httpsCallable<Request, Response>(firebaseFunctions, name)(data);
  return result.data;
}
