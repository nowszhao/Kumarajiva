export function extractJsonFromString(input) {
    const jsonRegex = /```json([\s\S]*?)```|```([\s\S]*?)```|(\[[\s\S]*?\])/g;
    let match;
  
    if ((match = jsonRegex.exec(input)) !== null) {
        let jsonData;
        if (match[1]) {
            jsonData = match[1].trim();
        } else if (match[2]) {
            jsonData = match[2].trim();
        } else if (match[3]) {
            jsonData = match[3].trim();
        }
        return  jsonData;
    }
    return input;
}