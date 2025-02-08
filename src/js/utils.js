export function extractJsonFromString(input) {
    const jsonRegex = /```json([\s\S]*?)```|```([\s\S]*?)```/g;
    let match;
    let jsonData = '';

    while ((match = jsonRegex.exec(input)) !== null) {
        if (match[1]) {
            jsonData += match[1].trim();
        } else if (match[2]) {
            jsonData += match[2].trim();
        } else if (match[3]) {
            jsonData += match[3].trim();
        }
    }

    if (jsonData) {
        return jsonData;
    }

    return input;
}