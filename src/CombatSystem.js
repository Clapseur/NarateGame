import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';

export class CombatSystem {
    constructor(gameEngine) {
        this.game = gameEngine;
        this.ennemiActuel = null;
        this.tourCombat = 0;
        this.effetsActifs = {
            joueur: {},
            ennemi: {}
        };
    }

    // Démarrage d'un combat
    async demarrerCombat(ennemiId) {
        this.ennemiActuel = this.creerEnnemi(ennemiId);
        this.tourCombat = 0;
        this.effetsActifs = { joueur: {}, ennemi: {} };

        console.clear();
        this.afficherDebutCombat();

        // Vérifier si le combat peut être évité
        if (this.peutEviterCombat(ennemiId)) {
            const choixEviter = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'eviter',
            message: 'Vous pouvez éviter ce combat. Voulez-vous l\'éviter ?',
                    default: false
                }
            ]);

            if (choixEviter.eviter) {
                console.log(chalk.green(this.game.gameData.enemies[ennemiId].dialogue_fuite));
                await this.game.attendreEntree();
                return 'fuite_reussie';
            }
        }

        // Boucle de combat
        while (this.game.gameState.joueur.vie_actuelle > 0 && this.ennemiActuel.vie > 0) {
            this.tourCombat++;
            
            // Tour du joueur
            const actionJoueur = await this.tourJoueur();
            if (actionJoueur === 'fuite') {
                return 'fuite';
            }

            // Vérifier si l'ennemi est vaincu
            if (this.ennemiActuel.vie <= 0) {
                return await this.finCombat('victoire');
            }

            // Tour de l'ennemi
            await this.tourEnnemi();

            // Vérifier si le joueur est vaincu
            if (this.game.gameState.joueur.vie_actuelle <= 0) {
                return await this.finCombat('defaite');
            }

            // Gestion des effets temporaires
            this.gererEffetsTemporaires();
        }
    }

    // Création d'une instance d'ennemi
    creerEnnemi(ennemiId) {
        const template = this.game.gameData.enemies[ennemiId];
        return {
            id: ennemiId,
            nom: template.nom,
            description: template.description,
            vie: template.stats.vie,
            vie_max: template.stats.vie,
            attaque: template.stats.attaque,
            defense: template.stats.defense,
            vitesse: template.stats.vitesse,
            attaques: [...template.attaques],
            resistances: [...template.resistances],
            faiblesses: [...template.faiblesses],
            loot: [...template.loot],
            experience: template.experience,
            or: template.or,
            rechargeCooldowns: {}
        };
    }

    // Vérification si le combat peut être évité
    peutEviterCombat(ennemiId) {
        const ennemiData = this.game.gameData.enemies[ennemiId];
        const classeJoueur = this.game.gameState.joueur.classe;
        
        if (!ennemiData.evitable_par) return false;

        return ennemiData.evitable_par.some(condition => {
            if (condition === `${classeJoueur}_intimidation` && classeJoueur === 'guerrier') {
                return true;
            }
            if (condition === `${classeJoueur}_autorite_divine` && classeJoueur === 'paladin') {
                return true;
            }
            if (condition === `${classeJoueur}_discretion` && classeJoueur === 'voleur') {
                return true;
            }
            if (condition === `${classeJoueur}_connaissance_arcane` && classeJoueur === 'mage') {
                return true;
            }
            return false;
        });
    }

    // Affichage du début de combat
    afficherDebutCombat() {
        const ennemiData = this.game.gameData.enemies[this.ennemiActuel.id];
        
        console.log(boxen(
            chalk.red.bold('⚔️ COMBAT ⚔️\n\n') +
            chalk.yellow(`Un ${this.ennemiActuel.nom} apparaît !\n`) +
            chalk.white(this.ennemiActuel.description),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'double',
                borderColor: 'red'
            }
        ));

        if (ennemiData.dialogue_pre_combat) {
            console.log(chalk.italic.gray(ennemiData.dialogue_pre_combat));
        }
    }

    // Tour du joueur
    async tourJoueur() {
        this.afficherStatutCombat();

        const actions = [
            { name: '⚔️ Attaquer', value: 'attaquer' },
            { name: '🛡️ Défendre', value: 'defendre' },
            { name: '🎒 Utiliser un objet', value: 'objet' },
            { name: '🏃 Fuir', value: 'fuir' }
        ];

        // Ajouter les compétences spéciales
        const competences = this.game.gameState.joueur.competences;
        competences.forEach((comp, index) => {
            if (this.game.gameState.joueur.energie_actuelle >= comp.cout_energie) {
                actions.splice(-1, 0, { 
                    name: `✨ ${comp.nom} (${comp.cout_energie} énergie)`, 
                    value: `competence_${index}` 
                });
            }
        });

        const choix = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Que voulez-vous faire ?',
                choices: actions
            }
        ]);

        switch (choix.action) {
            case 'attaquer':
                return await this.attaqueJoueur();
            case 'defendre':
                return await this.defenseJoueur();
            case 'objet':
                return await this.utiliserObjet();
            case 'fuir':
                return await this.tentativeFuite();
            default:
                if (choix.action.startsWith('competence_')) {
                    const index = parseInt(choix.action.split('_')[1]);
                    return await this.utiliserCompetence(index);
                }
        }
    }

    // Attaque du joueur
    async attaqueJoueur() {
        const joueur = this.game.gameState.joueur;
        const degatsBase = joueur.stats.attaque + Math.floor(Math.random() * 6) - 2;
        const degatsFinaux = Math.max(1, degatsBase - this.ennemiActuel.defense);

        this.ennemiActuel.vie -= degatsFinaux;
        this.ennemiActuel.vie = Math.max(0, this.ennemiActuel.vie);

        console.log(chalk.green(`💥 Vous attaquez ${this.ennemiActuel.nom} et infligez ${degatsFinaux} dégâts !`));
        
        if (this.ennemiActuel.vie > 0) {
            console.log(chalk.yellow(`${this.ennemiActuel.nom} a maintenant ${this.ennemiActuel.vie}/${this.ennemiActuel.vie_max} PV`));
        } else {
            console.log(chalk.red(`${this.ennemiActuel.nom} est vaincu !`));
        }

        await this.game.attendreEntree();
        return 'attaque';
    }

    // Défense du joueur
    async defenseJoueur() {
        this.effetsActifs.joueur.defense_boost = 2;
        console.log(chalk.blue('🛡️ Vous vous mettez en position défensive !'));
        console.log(chalk.cyan('Votre défense est temporairement augmentée.'));
        await this.game.attendreEntree();
        return 'defense';
    }

    // Utilisation d'une compétence
    async utiliserCompetence(index) {
        const competence = this.game.gameState.joueur.competences[index];
        this.game.gameState.joueur.energie_actuelle -= competence.cout_energie;

        console.log(chalk.magenta(`✨ Vous utilisez ${competence.nom} !`));
        console.log(chalk.white(competence.description));

        if (competence.degats) {
            let degats = competence.degats;
            
            // Bonus contre le mal pour les paladins
            if (competence.degats_bonus_mal && this.ennemiActuel.faiblesses.includes('magie_divine')) {
                degats += competence.degats_bonus_mal;
                console.log(chalk.yellow('💫 Dégâts supplémentaires contre le mal !'));
            }

            const degatsFinaux = Math.max(1, degats - this.ennemiActuel.defense);
            this.ennemiActuel.vie -= degatsFinaux;
            this.ennemiActuel.vie = Math.max(0, this.ennemiActuel.vie);

            console.log(chalk.green(`💥 ${competence.nom} inflige ${degatsFinaux} dégâts !`));
        }

        if (competence.soin) {
            const soinEffectue = Math.min(competence.soin, 
                this.game.gameState.joueur.vie_max - this.game.gameState.joueur.vie_actuelle);
            this.game.gameState.joueur.vie_actuelle += soinEffectue;
            console.log(chalk.green(`💚 Vous récupérez ${soinEffectue} points de vie !`));
        }

        if (competence.effet) {
            this.effetsActifs.joueur[competence.effet] = competence.duree || 3;
            console.log(chalk.cyan(`✨ Effet ${competence.effet} activé !`));
        }

        await this.game.attendreEntree();
        return 'competence';
    }

    // Utilisation d'un objet
    async utiliserObjet() {
        const objetsUtilisables = this.game.gameState.inventaire.filter(item => {
            const itemData = this.obtenirDonneesItem(item.id);
            return itemData && itemData.type === 'consommable' && itemData.utilisable_combat;
        });

        if (objetsUtilisables.length === 0) {
            console.log(chalk.yellow('Aucun objet utilisable en combat.'));
            await this.game.attendreEntree();
            return await this.tourJoueur();
        }

        const choixObjets = objetsUtilisables.map(item => {
            const itemData = this.obtenirDonneesItem(item.id);
            return {
                name: `${itemData.nom} (x${item.quantite}) - ${itemData.description}`,
                value: item.id
            };
        });

        choixObjets.push({ name: '← Retour', value: 'retour' });

        const choix = await inquirer.prompt([
            {
                type: 'list',
                name: 'objet',
                message: 'Quel objet utiliser ?',
                choices: choixObjets
            }
        ]);

        if (choix.objet === 'retour') {
            return await this.tourJoueur();
        }

        return await this.appliquerEffetObjet(choix.objet);
    }

    // Application de l'effet d'un objet
    async appliquerEffetObjet(itemId) {
        const itemData = this.obtenirDonneesItem(itemId);
        
        console.log(chalk.cyan(`🎒 Vous utilisez ${itemData.nom}`));

        switch (itemData.effet) {
            case 'soin':
                const soinEffectue = Math.min(itemData.valeur_effet, 
                    this.game.gameState.joueur.vie_max - this.game.gameState.joueur.vie_actuelle);
                this.game.gameState.joueur.vie_actuelle += soinEffectue;
                console.log(chalk.green(`💚 Vous récupérez ${soinEffectue} points de vie !`));
                break;
            case 'mana':
                const manaEffectue = Math.min(itemData.valeur_effet, 
                    this.game.gameState.joueur.energie_max - this.game.gameState.joueur.energie_actuelle);
                this.game.gameState.joueur.energie_actuelle += manaEffectue;
                console.log(chalk.blue(`💙 Vous récupérez ${manaEffectue} points d'énergie !`));
                break;
        }

        this.game.retirerItem(itemId, 1);
        await this.game.attendreEntree();
        return 'objet';
    }

    // Tentative de fuite
    async tentativeFuite() {
        const chanceBase = 50;
        const bonusVitesse = (this.game.gameState.joueur.stats.vitesse - this.ennemiActuel.vitesse) * 5;
        const chanceFuite = Math.max(10, Math.min(90, chanceBase + bonusVitesse));

        const reussite = Math.random() * 100 < chanceFuite;

        if (reussite) {
            console.log(chalk.green('🏃 Vous réussissez à fuir le combat !'));
            await this.game.attendreEntree();
            return 'fuite';
        } else {
            console.log(chalk.red('❌ Impossible de fuir ! L\'ennemi vous bloque le passage !'));
            await this.game.attendreEntree();
            return 'fuite_echec';
        }
    }

    // Tour de l'ennemi
    async tourEnnemi() {
        const attaquesDisponibles = this.ennemiActuel.attaques.filter(attaque => {
            return !attaque.recharge || !this.ennemiActuel.rechargeCooldowns[attaque.nom] || 
                   this.ennemiActuel.rechargeCooldowns[attaque.nom] <= 0;
        });

        const attaqueChoisie = attaquesDisponibles[Math.floor(Math.random() * attaquesDisponibles.length)];
        
        console.log(chalk.red(`${this.ennemiActuel.nom} utilise ${attaqueChoisie.nom} !`));

        const precision = Math.random() * 100;
        if (precision <= attaqueChoisie.precision) {
            let degats = attaqueChoisie.degats;
            
            // Application de la défense du joueur
            const defenseJoueur = this.game.gameState.joueur.stats.defense + 
                                 (this.effetsActifs.joueur.defense_boost || 0);
            
            const degatsFinaux = Math.max(1, degats - defenseJoueur);
            this.game.gameState.joueur.vie_actuelle -= degatsFinaux;
            this.game.gameState.joueur.vie_actuelle = Math.max(0, this.game.gameState.joueur.vie_actuelle);

            console.log(chalk.red(`💥 ${attaqueChoisie.nom} vous inflige ${degatsFinaux} dégâts !`));
            
            // Gestion des effets spéciaux
            if (attaqueChoisie.effet) {
                console.log(chalk.yellow(`✨ Vous subissez l'effet : ${attaqueChoisie.effet}`));
            }
        } else {
            console.log(chalk.green('🛡️ L\'attaque vous rate !'));
        }

        // Gestion du cooldown
        if (attaqueChoisie.recharge) {
            this.ennemiActuel.rechargeCooldowns[attaqueChoisie.nom] = attaqueChoisie.recharge;
        }

        await this.game.attendreEntree();
    }

    // Affichage du statut de combat
    afficherStatutCombat() {
        console.clear();
        
        const joueur = this.game.gameState.joueur;
        const barreVieJoueur = this.creerBarreVie(joueur.vie_actuelle, joueur.vie_max);
        const barreEnergieJoueur = this.creerBarreEnergie(joueur.energie_actuelle, joueur.energie_max);
        const barreVieEnnemi = this.creerBarreVie(this.ennemiActuel.vie, this.ennemiActuel.vie_max);

        console.log(boxen(
            chalk.green.bold(`👤 ${joueur.nom} (${this.game.gameData.classes[joueur.classe].nom})\n`) +
            chalk.red(`❤️ Vie: ${barreVieJoueur} ${joueur.vie_actuelle}/${joueur.vie_max}\n`) +
            chalk.blue(`⚡ Énergie: ${barreEnergieJoueur} ${joueur.energie_actuelle}/${joueur.energie_max}\n\n`) +
            chalk.yellow.bold(`👹 ${this.ennemiActuel.nom}\n`) +
            chalk.red(`❤️ Vie: ${barreVieEnnemi} ${this.ennemiActuel.vie}/${this.ennemiActuel.vie_max}`),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'white'
            }
        ));
    }

    // Création d'une barre de vie visuelle
    creerBarreVie(actuel, max) {
        const longueur = 20;
        const pourcentage = actuel / max;
        const rempli = Math.floor(pourcentage * longueur);
        const vide = longueur - rempli;

        let couleur = chalk.green;
        if (pourcentage < 0.3) couleur = chalk.red;
        else if (pourcentage < 0.6) couleur = chalk.yellow;

        return couleur('█'.repeat(rempli)) + chalk.gray('░'.repeat(vide));
    }

    // Création d'une barre d'énergie visuelle
    creerBarreEnergie(actuel, max) {
        const longueur = 15;
        const pourcentage = actuel / max;
        const rempli = Math.floor(pourcentage * longueur);
        const vide = longueur - rempli;

        return chalk.blue('█'.repeat(rempli)) + chalk.gray('░'.repeat(vide));
    }

    // Fin de combat
    async finCombat(resultat) {
        console.clear();
        
        if (resultat === 'victoire') {
            const ennemiData = this.game.gameData.enemies[this.ennemiActuel.id];
            
            console.log(boxen(
                chalk.green.bold('🏆 VICTOIRE ! 🏆\n\n') +
                chalk.white(`Vous avez vaincu ${this.ennemiActuel.nom} !\n\n`) +
                chalk.yellow(`💰 Or gagné: ${ennemiData.or}\n`) +
                chalk.cyan(`⭐ Expérience: ${ennemiData.experience}`),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'double',
                    borderColor: 'green'
                }
            ));

            // Attribution des récompenses
            this.game.gameState.or += ennemiData.or;
            this.game.gameState.experience += ennemiData.experience;
            this.game.gameState.statistiques.ennemis_vaincus++;

            // Gestion du loot
            if (ennemiData.loot && ennemiData.loot.length > 0) {
                console.log(chalk.magenta('\n🎁 Objets trouvés:'));
                ennemiData.loot.forEach(lootItem => {
                    if (Math.random() * 100 < lootItem.chance) {
                        this.game.ajouterItem(lootItem.item);
                        const itemData = this.obtenirDonneesItem(lootItem.item);
                        console.log(chalk.green(`  • ${itemData.nom}`));
                        this.game.gameState.statistiques.objets_trouves++;
                    }
                });
            }

            await this.game.attendreEntree();
            return 'victoire';
            
        } else if (resultat === 'defaite') {
            console.log(boxen(
                chalk.red.bold('💀 DÉFAITE 💀\n\n') +
                chalk.white('Vous avez été vaincu...\n') +
                chalk.gray('Votre aventure se termine ici.'),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'double',
                    borderColor: 'red'
                }
            ));

            await this.game.attendreEntree();
            return 'defaite';
        }
    }

    // Gestion des effets temporaires
    gererEffetsTemporaires() {
        // Réduction des cooldowns des effets du joueur
        Object.keys(this.effetsActifs.joueur).forEach(effet => {
            this.effetsActifs.joueur[effet]--;
            if (this.effetsActifs.joueur[effet] <= 0) {
                delete this.effetsActifs.joueur[effet];
            }
        });

        // Réduction des cooldowns des attaques de l'ennemi
        Object.keys(this.ennemiActuel.rechargeCooldowns).forEach(attaque => {
            this.ennemiActuel.rechargeCooldowns[attaque]--;
            if (this.ennemiActuel.rechargeCooldowns[attaque] <= 0) {
                delete this.ennemiActuel.rechargeCooldowns[attaque];
            }
        });
    }

    // Utilitaire pour obtenir les données d'un objet
    obtenirDonneesItem(itemId) {
        // Chercher dans toutes les catégories d'objets
        for (const categorie of Object.values(this.game.gameData.items)) {
            if (categorie[itemId]) {
                return categorie[itemId];
            }
        }
        return null;
    }
}
