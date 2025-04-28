# EasyWarehouse

Aplikacja do zarządzania magazynem i fakturami, zbudowana przy użyciu Electron.

## Funkcje

- Zarządzanie produktami (dodawanie, edycja, przeglądanie)
- Śledzenie stanu magazynowego
- Wystawianie faktur
- Generowanie raportów

## Wymagania

- Node.js (wersja 14 lub nowsza)
- npm lub yarn

## Instalacja dla deweloperów

```bash
# Klonowanie repozytorium
git clone https://github.com/twoj-username/easywarehouse.git
cd easywarehouse

# Instalacja zależności
npm install

# Uruchomienie aplikacji w trybie deweloperskim
npm start
```

## Budowanie aplikacji

Aplikacja może być zbudowana dla systemów Windows, macOS i Linux.

### Przygotowanie do budowania

1. Upewnij się, że masz zainstalowane wszystkie zależności:
   ```bash
   npm install
   ```

2. Jeśli chcesz zbudować aplikację dla systemu innego niż Twój obecny, sprawdź [dokumentację electron-builder](https://www.electron.build/multi-platform-build) dotyczącą budowania wieloplatformowego.

### Budowanie dla różnych platform

#### Windows

```bash
npm run build:win
```

Wynikowe pliki będą w katalogu `dist`.

#### macOS

```bash
npm run build:mac
```

Wynikowe pliki będą w katalogu `dist`.

#### Linux

```bash
npm run build:linux
```

Wynikowe pliki będą w katalogu `dist`.

### Budowanie dla wszystkich platform

```bash
npm run build
```

## Struktura projektu

- `main.js` - Główny plik procesu głównego Electron
- `index.html` - Główny plik HTML interfejsu użytkownika
- `renderer.js` - Skrypty obsługujące interfejs użytkownika
- `warehouse.db` - Baza danych SQLite przechowująca dane aplikacji

## Licencja

ISC 