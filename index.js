#!/usr/bin/env node

import { GameEngine } from './src/GameEngine.js';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';

// Fonction pour afficher le titre du jeu
function afficherTitre() {
    console.clear();
    
    // Titre ASCII art
    const titre = figlet.textSync('DONJON', {
        font: 'Big',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    });
    
    console.log(chalk.red.bold(titre));
    console.log(chalk.yellow.bold('    Un RPG narratif en terminal'));
    console.log(chalk.gray('    Version 1.0 - Aventure en français\n'));

    // Message de sauvegarde (manuel)
    const msg = boxen(
        chalk.yellow.bold('IMPORTANT — SAUVEGARDE MANUELLE\n\n') +
        chalk.white('Aucune sauvegarde automatique. Vous pouvez sauvegarder de deux façons:\n') +
        chalk.white('• Appuyez sur ') + chalk.cyan.bold('Ctrl+S') + chalk.white(' à tout moment pour sauvegarder rapidement.\n') +
        chalk.white('• Choisissez ') + chalk.cyan.bold('"💾 Sauvegarder la partie"') + chalk.white(' dans les choix narratifs.\n\n') +
        chalk.gray('Conseil: sauvegardez avant les combats importants ou décisions majeures.'),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
    );
    console.log(msg);
}

async function main() {
    try {
        afficherTitre();
        
        // fonction permettant de demarrer le jeu
        const jeu = new GameEngine();
        await jeu.initialiser();

        // Hotkey Ctrl+S pour sauvegarder
        if (process.stdin.isTTY && process.stdin.setRawMode) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', async (data) => {
                const isCtrlS = data && data.length === 1 && data[0] === 19; // 0x13
                if (isCtrlS) {
                    const fileName = await jeu.sauvegarderPartie('manuel');
                    if (fileName) {
                        console.log(chalk.green(`\n💾 Sauvegarde rapide effectuée: ${fileName}`));
                    } else {
                        console.log(chalk.red('\n❌ Échec de la sauvegarde rapide'));
                    }
                }
            });
        }

        await jeu.menuPrincipal();
        
    } catch (erreur) {
        console.error(chalk.red.bold('ERREUR CRITIQUE: ' + chalk.red(erreur.message)));
        console.error(chalk.gray('\nDétails techniques:'));
        console.error(chalk.gray(erreur.stack));
        
        console.log(chalk.yellow('\n🔧 Suggestions de dépannage:'));
        console.log(chalk.white('1. Vérifiez que tous les fichiers de données sont présents'));
        console.log(chalk.white('2. Assurez-vous que les dépendances npm sont installées'));
        console.log(chalk.white('3. Vérifiez les permissions d\'écriture dans le dossier saves/'));
        
        process.exit(1);
    }
}

// gère le message de sauvegarde lors de la fermeture du jeu
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n👋 Au revoir, aventurier !'));
    console.log(chalk.gray('Aucune sauvegarde automatique. Utilisez Ctrl+S ou le choix "💾 Sauvegarder la partie" avant de quitter.'));
    process.exit(0);
});

process.on('uncaughtException', (erreur) => {
    console.error(chalk.red.bold('\n❌ ERREUR NON GÉRÉE:'));
    console.error(chalk.red(erreur.message));
    console.log(chalk.yellow('Le jeu va se fermer pour éviter la corruption des données.'));
    process.exit(1);
});

// Démarrer le jeu
main();
