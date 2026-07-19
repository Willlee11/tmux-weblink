export function handleClientMessage(raw, ptyProcess) {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
    let msg;
    try {
        msg = JSON.parse(data);
    }
    catch {
        return false;
    }
    if (msg.type === 'input' && typeof msg.data === 'string') {
        ptyProcess.write(msg.data);
        return true;
    }
    if (msg.type === 'resize' &&
        typeof msg.cols === 'number' &&
        typeof msg.rows === 'number') {
        ptyProcess.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
        return true;
    }
    return false;
}
